/*
Tujuan: Menyediakan sinkronisasi state cloud SmartPatrol di atas tabel SQL normalisasi.
Caller: AppContextRuntime untuk hydrate state, publish sinyal realtime, simpan snapshot, dan upload aset.
Dependensi: Supabase Postgres/Realtime, adapter aset, outbox IndexedDB, dan mapping state legacy.
Main Functions: Fetch/hydrate state dari SQL, decompose state lokal ke tabel SQL, subscribe perubahan realtime per tabel, signal ringan, RPC penerima admin, dan watermark recovery.
Side Effects: Membaca/menulis tabel profiles, ships, patrol_reports, incidents, client_mutations, RPC admin/watermark, serta cache IndexedDB.
*/

import { sanitizeEmail, sanitizePhone, sanitizeText, sanitizeUrl } from '../../utils/sanitize';
import { ensureSupabaseClient, isSupabaseConfigured } from './app';
import { uploadCloudDataUrlAsset } from './assets';
import { enqueueOutboxMutation, loadCacheSnapshot, registerOutboxHandler, saveCacheSnapshot } from './outbox';

const CLOUD_STATE_SCHEMA_VERSION = 1;
const isCloudSyncAllowedByEnv = import.meta.env.VITE_ENABLE_CLOUD_SYNC !== '0';
const isCloudWriteAllowedByEnv = import.meta.env.VITE_ENABLE_CLOUD_SYNC_WRITE !== '0';
const isCloudSyncEnabled = Boolean(isSupabaseConfigured) && isCloudSyncAllowedByEnv;
const isCloudWriteEnabled = isCloudSyncEnabled && isCloudWriteAllowedByEnv;

const PROFILE_COLUMNS = [
  'id',
  'auth_uid',
  'email',
  'name',
  'role',
  'type',
  'worker_number',
  'status',
  'ship_assigned',
  'phone',
  'dob',
  'address',
  'office_address',
  'emergency_name',
  'emergency_contact',
  'emergency_relation',
  'photo_url',
  'credential_updated_at',
  'duty_end_date',
  'duty_status',
  'enabled',
  'review_state',
  'created_at',
  'updated_at',
].join(',');

const SHIP_COLUMNS = [
  'id',
  'name',
  'type',
  'imo_number',
  'lat',
  'lng',
  'status',
  'route',
  'route_loading',
  'route_discharge',
  'cargo_type',
  'cargo_amount',
  'photo_url',
  'personnel',
  'personnel_next_month',
  'personnel_schedules',
  'custom_checkpoints',
  'documents',
  'sos_recipient_ship_ids',
  'created_at',
  'updated_at',
].join(',');

const PATROL_REPORT_COLUMNS = [
  'id',
  'client_event_id',
  'shift_key',
  'ship_id',
  'checkpoint_id',
  'ship_name',
  'checkpoint_name',
  'status',
  'result_type',
  'completed_by_user_id',
  'completed_by',
  'occurred_at_trusted_ms',
  'client_updated_at_ms',
  'server_updated_at',
  'media_status',
  'photo_url',
  'payload',
  'created_at',
  'updated_at',
].join(',');

const INCIDENT_COLUMNS = [
  'id',
  'client_event_id',
  'ship_name',
  'status',
  'location',
  'reported_by',
  'occurred_at_trusted_ms',
  'client_updated_at_ms',
  'server_updated_at',
  'photo_url',
  'payload',
  'created_at',
  'updated_at',
].join(',');

const SOS_ALERT_COLUMNS = [
  'id',
  'client_event_id',
  'triggered_by',
  'ship_name',
  'lat',
  'lng',
  'status',
  'triggered_at',
  'payload',
  'created_at',
  'updated_at',
].join(',');

const NOTIFICATION_COLUMNS = [
  'id',
  'target_user_id',
  'target_role',
  'ship_name',
  'type',
  'title',
  'body',
  'read',
  'tone',
  'payload',
  'created_at',
  'updated_at',
].join(',');

const SIGNAL_DOMAIN_TABLES = {
  app_state: ['profiles', 'ships'],
  state_sync: ['profiles', 'ships'],
  users: ['profiles'],
  profiles: ['profiles'],
  ships: ['ships'],
  patrol_reports: ['patrol_reports'],
  patrol_report: ['patrol_reports'],
  incidents: ['incidents'],
  incident: ['incidents'],
  sos_alerts: ['sos_alerts'],
  sos: ['sos_alerts'],
  notifications: ['notifications'],
  notification: ['notifications'],
};

const SYNC_WATERMARK_KEYS = [
  'patrol_reports',
  'incidents',
  'sos_alerts',
  'notifications',
  'patrol_report_tombstones',
];

function normalizeSignalDomain(value = '') {
  return sanitizeText(value || '', 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function resolveSignalTables(row = {}) {
  const signal = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const candidates = [
    signal.domain,
    signal.table,
    signal.collection,
    signal.reason,
    row.mutation_type,
  ].filter(Boolean);
  const tables = new Set();

  candidates.forEach((candidate) => {
    const domain = normalizeSignalDomain(candidate);
    const mappedTables = SIGNAL_DOMAIN_TABLES[domain] || [];
    mappedTables.forEach((table) => tables.add(table));
    if (domain.includes('sos')) tables.add('sos_alerts');
    if (domain.includes('notif')) tables.add('notifications');
    if (domain.includes('incident')) tables.add('incidents');
    if (domain.includes('patrol')) tables.add('patrol_reports');
  });

  if (signal.activeSOSAlert) tables.add('sos_alerts');
  if (Number(signal.users || 0) > 0) tables.add('profiles');
  if (Number(signal.ships || 0) > 0) tables.add('ships');

  return Array.from(tables);
}

function profileToUser(row = {}) {
  return {
    id: row.id || row.auth_uid || '',
    name: sanitizeText(row.name || '', 80) || 'Personil',
    role: sanitizeText(row.role || 'PETUGAS', 20).toUpperCase(),
    type: sanitizeText(row.type || 'BUJP', 20) || 'BUJP',
    workerNumber: sanitizeText(row.worker_number || '', 40),
    status: sanitizeText(row.status || 'off-duty', 20).toLowerCase(),
    shipAssigned: sanitizeText(row.ship_assigned || '', 80) || null,
    email: sanitizeEmail(row.email || ''),
    authProvider: 'supabase',
    firebaseUid: row.auth_uid || row.id || null,
    phone: sanitizePhone(row.phone || ''),
    dob: sanitizeText(row.dob || '', 20),
    address: sanitizeText(row.address || '', 180),
    officeAddress: sanitizeText(row.office_address || '', 180),
    emergencyName: sanitizeText(row.emergency_name || '', 80),
    emergencyContact: sanitizePhone(row.emergency_contact || ''),
    emergencyRelation: sanitizeText(row.emergency_relation || 'Orang Tua', 40) || 'Orang Tua',
    photoUrl: sanitizeUrl(row.photo_url || '') || null,
    credentialUpdatedAt: row.credential_updated_at || null,
    dutyEndDate: row.duty_end_date || null,
    dutyStatus: row.duty_status || null,
    updatedAt: row.updated_at || null,
  };
}

function shipToState(row = {}) {
  return {
    id: row.id || '',
    name: sanitizeText(row.name || '', 100) || 'Kapal',
    type: sanitizeText(row.type || '', 40),
    imoNumber: sanitizeText(row.imo_number || '', 20),
    lat: sanitizeText(row.lat || '', 40),
    lng: sanitizeText(row.lng || '', 40),
    status: sanitizeText(row.status || 'Non Operasional', 30),
    route: sanitizeText(row.route || '', 120),
    routeLoading: sanitizeText(row.route_loading || '', 120),
    routeDischarge: sanitizeText(row.route_discharge || '', 120),
    cargoType: sanitizeText(row.cargo_type || '', 80),
    cargoAmount: sanitizeText(row.cargo_amount || '', 80),
    photoUrl: sanitizeUrl(row.photo_url || '') || null,
    personnel: Array.isArray(row.personnel) ? row.personnel : [],
    personnelNextMonth: Array.isArray(row.personnel_next_month) ? row.personnel_next_month : [],
    personnelSchedules: row.personnel_schedules || {},
    customCheckpoints: Array.isArray(row.custom_checkpoints) ? row.custom_checkpoints : [],
    documents: Array.isArray(row.documents) ? row.documents : [],
    sosRecipientShipIds: Array.isArray(row.sos_recipient_ship_ids) ? row.sos_recipient_ship_ids : [],
    updatedAt: row.updated_at || null,
  };
}

function reportRowToCheckpoint(row = {}) {
  return {
    ...(row.payload || {}),
    firestoreId: row.id || row.payload?.firestoreId || null,
    id: row.checkpoint_id || row.payload?.id || row.payload?.checkpointId,
    checkpointId: row.checkpoint_id || row.payload?.checkpointId,
    shipId: row.ship_id || row.payload?.shipId,
    shipName: row.ship_name || row.payload?.shipName,
    shiftKey: row.shift_key || row.payload?.shiftKey,
    status: row.status || row.payload?.status || 'pending',
    resultType: row.result_type || row.payload?.resultType || null,
    photoUrl: row.photo_url || row.payload?.photoUrl || null,
  };
}

function incidentRowToState(row = {}) {
  return {
    ...(row.payload || {}),
    id: row.id || row.payload?.id,
    shipName: row.ship_name || row.payload?.shipName,
    status: row.status || row.payload?.status || 'open',
    location: row.location || row.payload?.location || '',
    reportedBy: row.reported_by || row.payload?.reportedBy || '',
    photoUrl: row.photo_url || row.payload?.photoUrl || null,
  };
}

function userToProfileRow(user = {}) {
  return {
    id: String(user.id || user.firebaseUid || ''),
    auth_uid: user.firebaseUid || null,
    email: sanitizeEmail(user.email || ''),
    name: sanitizeText(user.name || '', 80) || 'Personil',
    role: sanitizeText(user.role || 'PETUGAS', 20).toUpperCase(),
    status: sanitizeText(user.status || 'off-duty', 20).toLowerCase(),
    ship_assigned: sanitizeText(user.shipAssigned || '', 80) || null,
    type: sanitizeText(user.type || 'BUJP', 20) || 'BUJP',
    worker_number: sanitizeText(user.workerNumber || '', 40),
    phone: sanitizePhone(user.phone || ''),
    dob: sanitizeText(user.dob || '', 20),
    address: sanitizeText(user.address || '', 180),
    office_address: sanitizeText(user.officeAddress || '', 180),
    emergency_name: sanitizeText(user.emergencyName || '', 80),
    emergency_contact: sanitizePhone(user.emergencyContact || ''),
    emergency_relation: sanitizeText(user.emergencyRelation || '', 40),
    photo_url: sanitizeUrl(user.photoUrl || '') || null,
    enabled: user.status !== 'disabled',
    review_state: 'approved',
  };
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

async function reconcileProfileRowIds(supabase, profileRows = []) {
  const rowsWithAuthUid = profileRows.filter(row => row?.auth_uid && isUuidLike(row.auth_uid));
  const emailValues = Array.from(new Set(profileRows.map(row => row?.email).filter(Boolean)));
  const authUidValues = Array.from(new Set(rowsWithAuthUid.map(row => row.auth_uid)));
  if (authUidValues.length === 0 && emailValues.length === 0) return profileRows;

  try {
    const existingRows = [];
    if (authUidValues.length > 0) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,auth_uid,email')
        .in('auth_uid', authUidValues);
      if (error) throw error;
      existingRows.push(...(data || []));
    }
    if (emailValues.length > 0) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,auth_uid,email')
        .in('email', emailValues);
      if (error) throw error;
      existingRows.push(...(data || []));
    }

    const existingByAuthUid = new Map();
    const existingByEmail = new Map();
    existingRows.forEach((row) => {
      if (row?.auth_uid) existingByAuthUid.set(String(row.auth_uid), row);
      if (row?.email) existingByEmail.set(sanitizeEmail(row.email), row);
    });

    return profileRows.map((row) => {
      const existing = (
        (row.auth_uid && existingByAuthUid.get(String(row.auth_uid)))
        || (row.email && existingByEmail.get(sanitizeEmail(row.email)))
      );
      if (!existing?.id || existing.id === row.id) return row;
      // Pertahankan primary key profile cloud agar auth_uid unik tidak bentrok saat state lokal lama masih memakai id legacy.
      return {
        ...row,
        id: existing.id,
      };
    });
  } catch (error) {
    console.warn('Gagal rekonsiliasi id profile cloud, lanjutkan payload lokal', error);
    return profileRows;
  }
}

function shipToRow(ship = {}) {
  return {
    id: String(ship.id || ''),
    name: sanitizeText(ship.name || '', 100) || 'Kapal',
    type: sanitizeText(ship.type || '', 40),
    imo_number: sanitizeText(ship.imoNumber || '', 20),
    lat: sanitizeText(ship.lat || '', 40),
    lng: sanitizeText(ship.lng || '', 40),
    status: sanitizeText(ship.status || 'Non Operasional', 30),
    route: sanitizeText(ship.route || '', 120),
    route_loading: sanitizeText(ship.routeLoading || '', 120),
    route_discharge: sanitizeText(ship.routeDischarge || '', 120),
    cargo_type: sanitizeText(ship.cargoType || '', 80),
    cargo_amount: sanitizeText(ship.cargoAmount || '', 80),
    photo_url: sanitizeUrl(ship.photoUrl || '') || null,
    personnel: Array.isArray(ship.personnel) ? ship.personnel : [],
    personnel_next_month: Array.isArray(ship.personnelNextMonth) ? ship.personnelNextMonth : [],
    personnel_schedules: ship.personnelSchedules || {},
    custom_checkpoints: Array.isArray(ship.customCheckpoints) ? ship.customCheckpoints : [],
    documents: Array.isArray(ship.documents) ? ship.documents : [],
    sos_recipient_ship_ids: Array.isArray(ship.sosRecipientShipIds) ? ship.sosRecipientShipIds : [],
  };
}

function isRowLevelSecurityError(error) {
  return String(error?.message || '').toLowerCase().includes('row-level security');
}

function deriveNotificationTone(type = '') {
  if (type === 'sos' || type === 'sos_triggered' || type.startsWith('sos')) return 'critical';
  if (
    type === 'checkpoint_pending'
    || type === 'checkpoint_missed'
    || type === 'registration_pending'
    || type.startsWith('incident')
  ) {
    return 'warning';
  }
  if (type === 'welcome_to_ship' || type === 'registration_approved') return 'success';
  return 'info';
}

// Id stabil lintas-client untuk satu notifikasi logis. Pakai dedupeKey bila ada agar
// notifikasi yang sama yang dibuat oleh beberapa device (mis. shift_started dari banyak
// petugas, registration_pending dari banyak admin) bertabrakan di baris DB yang sama
// (ON CONFLICT DO NOTHING) alih-alih menghasilkan duplikat di inbox penerima.
export function getNotificationCloudBaseId(record = {}) {
  return sanitizeText(record?.dedupeKey || record?.id || '', 200);
}

// Mengubah satu notifikasi frontend (banyak penerima) menjadi banyak baris DB fan-out
// (satu baris per penerima). target_user_id terisi agar RLS notifications_read_target
// dan status baca per-user bekerja natural, sekaligus siap untuk push notification.
function notificationRecordToRows(record = {}) {
  const baseId = getNotificationCloudBaseId(record);
  if (!baseId) return [];
  const targetUserIds = Array.from(new Set(
    (Array.isArray(record.targetUserIds) ? record.targetUserIds : []).filter(Boolean),
  ));
  if (targetUserIds.length === 0) return [];
  const readSet = new Set((Array.isArray(record.readByUserIds) ? record.readByUserIds : []).filter(Boolean));
  const shipName = sanitizeText(record.shipName || '', 120) || null;
  const type = sanitizeText(record.type || 'general', 80) || 'general';
  const title = sanitizeText(record.title || 'Notifikasi Sistem', 200) || 'Notifikasi Sistem';
  const body = sanitizeText(record.message || '', 1500);
  const tone = deriveNotificationTone(type);
  const createdAt = record.createdAt || new Date().toISOString();
  const payload = { ...record, baseId };
  return targetUserIds.map((targetUserId) => ({
    id: `${baseId}::${targetUserId}`,
    target_user_id: targetUserId,
    target_role: null,
    ship_name: shipName,
    type,
    title,
    body,
    tone,
    read: readSet.has(targetUserId),
    payload,
    created_at: createdAt,
  }));
}

// Kebalikan dari fan-out: gabungkan kembali baris-baris DB menjadi satu record frontend
// dengan targetUserIds[] dan readByUserIds[]. Baris (kolom read) adalah sumber kebenaran
// status baca per penerima.
function reconstructNotificationsFromRows(rows = []) {
  const groups = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const baseId = payload.baseId
      || (typeof row?.id === 'string' && row.id.includes('::') ? row.id.split('::')[0] : row?.id);
    if (!baseId) return;
    let group = groups.get(baseId);
    if (!group) {
      const { targetUserIds: _ignoreTargets, readByUserIds: _ignoreReads, ...baseRest } = payload;
      group = {
        base: { ...baseRest, id: baseId },
        targetUserIds: new Set(),
        readByUserIds: new Set(),
        createdAt: payload.createdAt || row?.created_at || new Date().toISOString(),
      };
      groups.set(baseId, group);
    }
    if (row?.target_user_id) {
      group.targetUserIds.add(row.target_user_id);
      if (row.read) group.readByUserIds.add(row.target_user_id);
    }
  });
  return Array.from(groups.values()).map((group) => ({
    ...group.base,
    targetUserIds: Array.from(group.targetUserIds),
    readByUserIds: Array.from(group.readByUserIds),
    createdAt: group.createdAt,
  }));
}

// Persist notifikasi baru ke tabel (fan-out). ignoreDuplicates memastikan status baca
// baris yang sudah ada tidak pernah ditimpa — pembaruan status baca lewat
// markNotificationRecipientRead. Aman dipanggil idempoten oleh device mana pun.
export async function persistNotificationRecords(records = []) {
  if (!isCloudWriteEnabled) return;
  const rows = (Array.isArray(records) ? records : []).flatMap(notificationRecordToRows);
  if (rows.length === 0) return;
  const supabase = ensureSupabaseClient();
  const { error } = await supabase
    .from('notifications')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (error && !isRowLevelSecurityError(error)) throw error;
}

// Tandai notifikasi sebagai dibaca hanya untuk baris milik user ini (RLS update
// hanya mengizinkan target_user_id = current_profile_id()).
export async function markNotificationRecipientRead(baseIds = [], userId = '') {
  if (!isCloudWriteEnabled || !userId) return;
  const ids = (Array.isArray(baseIds) ? baseIds : [])
    .filter(Boolean)
    .map((baseId) => `${baseId}::${userId}`);
  if (ids.length === 0) return;
  const supabase = ensureSupabaseClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .in('id', ids);
  if (error && !isRowLevelSecurityError(error)) throw error;
}

async function readCloudRows(label, query, options = {}) {
  const { critical = false } = options;
  const { data, error } = await query;
  if (error) {
    if (critical) throw error;
    console.error(`Gagal memuat domain '${label}' saat hydrate cloud, lanjut tanpa data domain tersebut`, error);
    return [];
  }
  return data || [];
}

async function fetchProfilesRows(supabase) {
  return readCloudRows(
    'profiles',
    supabase.from('profiles').select(PROFILE_COLUMNS).order('name', { ascending: true }).limit(500),
    { critical: true },
  );
}

async function fetchShipsRows(supabase) {
  return readCloudRows(
    'ships',
    supabase.from('ships').select(SHIP_COLUMNS).order('name', { ascending: true }).limit(200),
    { critical: true },
  );
}

async function fetchPatrolReportRows(supabase) {
  return readCloudRows(
    'patrol_reports',
    supabase.from('patrol_reports').select(PATROL_REPORT_COLUMNS).limit(500),
    { critical: true },
  );
}

async function fetchIncidentRows(supabase) {
  return readCloudRows(
    'incidents',
    supabase.from('incidents').select(INCIDENT_COLUMNS).order('created_at', { ascending: false }).limit(200),
  );
}

async function fetchSosAlertRows(supabase) {
  return readCloudRows(
    'sos_alerts',
    supabase.from('sos_alerts').select(SOS_ALERT_COLUMNS).order('triggered_at', { ascending: false }).limit(20),
  );
}

async function fetchNotificationRows(supabase) {
  return readCloudRows(
    'notifications',
    supabase.from('notifications').select(NOTIFICATION_COLUMNS).order('created_at', { ascending: false }).limit(120),
  );
}

async function fetchLatestUpdatedAt(supabase, table, column = 'updated_at', options = {}) {
  let query = supabase
    .from(table)
    .select(column)
    .order(column, { ascending: false })
    .limit(1);

  if (options.shiftKey && table === 'patrol_reports') query = query.eq('shift_key', options.shiftKey);
  if (options.shipId && table === 'patrol_reports') query = query.eq('ship_id', options.shipId);
  if (options.shipName && (table === 'patrol_reports' || table === 'incidents')) query = query.eq('ship_name', options.shipName);

  const { data, error } = await query;
  if (error) throw error;
  return data?.[0]?.[column] || null;
}

export async function fetchCloudSyncWatermarks(options = {}) {
  if (!isCloudSyncEnabled) return null;
  const supabase = ensureSupabaseClient();
  const rpcParams = {
    p_shift_key: options.shiftKey || null,
    p_ship_id: options.shipId || null,
    p_ship_name: options.shipName || null,
  };

  try {
    const { data, error } = await supabase.rpc('get_operational_sync_watermarks', rpcParams);
    if (error) throw error;
    return SYNC_WATERMARK_KEYS.reduce((accumulator, key) => {
      accumulator[key] = data?.[key] || null;
      return accumulator;
    }, {});
  } catch (error) {
    // Migration watermark bisa belum ter-deploy saat frontend baru lebih dulu roll out.
    // Fallback ini tetap ringan: hanya ambil satu timestamp terbaru per domain.
    console.warn('Gagal memakai RPC watermark sync, fallback ke query timestamp ringan.', error);
    const [patrolReports, incidents, sosAlerts, notifications, tombstones] = await Promise.all([
      fetchLatestUpdatedAt(supabase, 'patrol_reports', 'updated_at', options).catch(() => null),
      fetchLatestUpdatedAt(supabase, 'incidents', 'updated_at', options).catch(() => null),
      fetchLatestUpdatedAt(supabase, 'sos_alerts', 'updated_at', options).catch(() => null),
      fetchLatestUpdatedAt(supabase, 'notifications', 'updated_at', options).catch(() => null),
      fetchLatestUpdatedAt(supabase, 'patrol_report_tombstones', 'deleted_at', options).catch(() => null),
    ]);
    return {
      patrol_reports: patrolReports,
      incidents,
      sos_alerts: sosAlerts,
      notifications,
      patrol_report_tombstones: tombstones,
    };
  }
}

export async function fetchAdminRecipientIds() {
  if (!isCloudSyncEnabled) return [];
  const supabase = ensureSupabaseClient();
  const { data, error } = await supabase.rpc('get_admin_recipient_ids');
  if (error) {
    console.warn('Gagal memuat penerima admin notifikasi', error);
    return [];
  }
  return Array.from(new Set(
    (Array.isArray(data) ? data : [])
      .map((row) => (typeof row === 'string' ? row : row?.get_admin_recipient_ids))
      .filter(Boolean),
  ));
}

function buildStatePayload(
  profileRows = [],
  shipRows = [],
  reportRows = [],
  incidentRows = [],
  sosRows = [],
  notifRows = [],
) {
  const checkpointsByShip = {};
  reportRows.forEach((row) => {
    const shipId = row.ship_id || row.payload?.shipId;
    if (!shipId) return;
    checkpointsByShip[shipId] = checkpointsByShip[shipId] || [];
    checkpointsByShip[shipId].push(reportRowToCheckpoint(row));
  });

  const incidentMeta = {};
  const incidentsData = incidentRows.map((row) => {
    const incident = incidentRowToState(row);
    incidentMeta[incident.id] = {
      progress: row.payload?.progress || [],
      documentation: row.payload?.documentation || [],
    };
    return incident;
  });

  sosRows.forEach((row) => {
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const sosId = row?.id || payload.id || null;
    if (!sosId || payload.deleted !== true) return;
    incidentMeta[sosId] = {
      ...(incidentMeta[sosId] || {}),
      deleted: true,
      status: 'closed',
    };
  });

  const activeSosRow = sosRows.find((row) => {
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    return row.status === 'active' && payload.deleted !== true;
  }) || null;

  return {
    schemaVersion: CLOUD_STATE_SCHEMA_VERSION,
    clientUpdatedAt: Date.now(),
    state: {
      shipsData: shipRows.map(shipToState),
      usersData: profileRows.map(profileToUser),
      checkpointsByShip,
      incidentsData,
      incidentMeta,
      historyEntries: [],
      notifications: reconstructNotificationsFromRows(notifRows),
      activeSOSAlert: activeSosRow?.payload || null,
      sosHistory: sosRows.filter(row => row.status !== 'active').map(row => row.payload || row),
      shiftStatusRecords: {},
    },
  };
}

async function hydrateStateFromSql() {
  const supabase = ensureSupabaseClient();
  const [profileRows, shipRows, reportRows, incidentRows, sosRows, notifRows] = await Promise.all([
    fetchProfilesRows(supabase),
    fetchShipsRows(supabase),
    fetchPatrolReportRows(supabase),
    fetchIncidentRows(supabase),
    fetchSosAlertRows(supabase),
    fetchNotificationRows(supabase),
  ]);

  return buildStatePayload(profileRows, shipRows, reportRows, incidentRows, sosRows, notifRows);
}

export function subscribeToCloudAppState(callback, onError) {
  if (!isCloudSyncEnabled) return () => {};
  const supabase = ensureSupabaseClient();
  let disposed = false;
  let hasHydratedOnce = false;
  let flushTimer = null;
  let fetchInFlight = false;
  let queuedFullHydrate = false;
  const queuedTables = new Set();

  const cachedRows = {
    profiles: [],
    ships: [],
    patrol_reports: [],
    incidents: [],
    sos_alerts: [],
    notifications: [],
  };

  const buildAndEmit = async () => {
    const payload = buildStatePayload(
      cachedRows.profiles,
      cachedRows.ships,
      cachedRows.patrol_reports,
      cachedRows.incidents,
      cachedRows.sos_alerts,
      cachedRows.notifications,
    );
    await saveCacheSnapshot('cloud-state', payload);
    if (!disposed) callback(payload);
    return payload;
  };

  const hydrateAllTablesNow = async () => {
    const [profileRows, shipRows, reportRows, incidentRows, sosRows, notifRows] = await Promise.all([
      fetchProfilesRows(supabase),
      fetchShipsRows(supabase),
      fetchPatrolReportRows(supabase),
      fetchIncidentRows(supabase),
      fetchSosAlertRows(supabase),
      fetchNotificationRows(supabase),
    ]);

    Object.assign(cachedRows, {
      profiles: profileRows,
      ships: shipRows,
      patrol_reports: reportRows,
      incidents: incidentRows,
      sos_alerts: sosRows,
      notifications: notifRows,
    });
    hasHydratedOnce = true;
  };

  const fetchOneTableNow = async (table) => {
    switch (table) {
      case 'patrol_reports':
        cachedRows.patrol_reports = await fetchPatrolReportRows(supabase);
        break;
      case 'incidents':
        cachedRows.incidents = await fetchIncidentRows(supabase);
        break;
      case 'sos_alerts':
        cachedRows.sos_alerts = await fetchSosAlertRows(supabase);
        break;
      case 'profiles':
        cachedRows.profiles = await fetchProfilesRows(supabase);
        break;
      case 'ships':
        cachedRows.ships = await fetchShipsRows(supabase);
        break;
      case 'notifications':
        cachedRows.notifications = await fetchNotificationRows(supabase);
        break;
      default:
        queuedFullHydrate = true;
        break;
    }
  };

  const scheduleFlush = (delayMs = 100) => {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushQueuedFetch().catch(onError);
    }, delayMs);
  };

  const flushQueuedFetch = async () => {
    if (fetchInFlight || disposed) return;
    fetchInFlight = true;
    try {
      do {
        const shouldFullHydrate = queuedFullHydrate || !hasHydratedOnce;
        const tables = Array.from(queuedTables);
        queuedFullHydrate = false;
        queuedTables.clear();

        if (shouldFullHydrate) {
          await hydrateAllTablesNow();
        } else if (tables.length > 0) {
          await Promise.all(tables.map(fetchOneTableNow));
        } else {
          return;
        }

        if (!disposed) await buildAndEmit();
      } while (!disposed && (queuedFullHydrate || queuedTables.size > 0));
    } finally {
      fetchInFlight = false;
      if (!disposed && (queuedFullHydrate || queuedTables.size > 0)) scheduleFlush(0);
    }
  };

  const scheduleFetch = (table, options = {}) => {
    if (options.full) queuedFullHydrate = true;
    if (table) queuedTables.add(table);
    scheduleFlush();
  };

  let signalRecoveryTimer = null;
  const scheduleSignalRecovery = () => {
    if (signalRecoveryTimer !== null) return;
    signalRecoveryTimer = setTimeout(() => {
      signalRecoveryTimer = null;
      ['profiles', 'ships', 'sos_alerts', 'notifications'].forEach(table => queuedTables.add(table));
      scheduleFlush(0);
    }, 30000);
  };

  queuedFullHydrate = true;
  flushQueuedFetch().catch(async (error) => {
    const cached = await loadCacheSnapshot('cloud-state').catch(() => null);
    if (cached && !disposed) callback(cached);
    onError?.(error);
  });

  const channel = supabase.channel('smartpatrol-sql-state')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'client_mutations' }, (event) => {
      const tables = resolveSignalTables(event?.new || {});
      if (tables.length === 0) {
        scheduleSignalRecovery();
        return;
      }
      tables.forEach((table) => scheduleFetch(table));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'patrol_reports' }, () => {
      scheduleFetch('patrol_reports');
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => {
      scheduleFetch('incidents');
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, () => {
      scheduleFetch('sos_alerts');
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
      scheduleFetch('profiles');
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ships' }, () => {
      scheduleFetch('ships');
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
      scheduleFetch('notifications');
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && hasHydratedOnce) {
        ['profiles', 'ships', 'sos_alerts', 'notifications'].forEach((table) => scheduleFetch(table));
      }
      if (status === 'CHANNEL_ERROR') {
        onError?.(new Error('Realtime state Supabase gagal.'));
      }
    });

  return () => {
    disposed = true;
    if (flushTimer !== null) clearTimeout(flushTimer);
    if (signalRecoveryTimer !== null) clearTimeout(signalRecoveryTimer);
    supabase.removeChannel(channel);
  };
}

export function subscribeToCloudSyncSignal(callback, onError) {
  if (!isCloudSyncEnabled) return () => {};
  const supabase = ensureSupabaseClient();

  const channel = supabase.channel('smartpatrol-sql-signal')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'client_mutations',
    }, (payload) => {
      callback({
        schemaVersion: CLOUD_STATE_SCHEMA_VERSION,
        clientUpdatedAt: payload.new?.client_updated_at_ms || Date.now(),
        signal: payload.new?.payload || payload.new,
      });
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') onError?.(new Error('Realtime signal Supabase gagal.'));
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function fetchCloudAppState() {
  if (!isCloudSyncEnabled) return null;
  try {
    const payload = await hydrateStateFromSql();
    await saveCacheSnapshot('cloud-state', payload);
    return payload;
  } catch (error) {
    return loadCacheSnapshot('cloud-state').catch(() => {
      throw error;
    });
  }
}

async function writeStateToSql(state, options = {}) {
  if (!isCloudWriteEnabled || !state) return state;
  const supabase = ensureSupabaseClient();

  const profileRows = Array.isArray(state.usersData)
    ? state.usersData.map(userToProfileRow).filter(row => row.id && row.email)
    : [];
  const shipRows = Array.isArray(state.shipsData)
    ? state.shipsData.map(shipToRow).filter(row => row.id)
    : [];

  if (profileRows.length > 0) {
    const reconciledProfileRows = await reconcileProfileRowIds(supabase, profileRows);
    const { error } = await supabase.from('profiles').upsert(reconciledProfileRows, { onConflict: 'id' });
    if (error && !String(error.message || '').toLowerCase().includes('row-level security')) throw error;
  }
  if (shipRows.length > 0) {
    const { error } = await supabase.from('ships').upsert(shipRows, { onConflict: 'id' });
    if (error && !String(error.message || '').toLowerCase().includes('row-level security')) throw error;
  }

  await supabase.from('client_mutations').insert({
    client_event_id: `state-sync-${options.clientUpdatedAt || Date.now()}`,
    mutation_type: 'state-sync',
    client_updated_at_ms: Math.round(options.clientUpdatedAt || Date.now()),
    payload: {
      domain: 'app_state',
      reason: options.reason || 'state-sync',
      users: profileRows.length,
      ships: shipRows.length,
    },
  }).throwOnError();

  return state;
}

registerOutboxHandler('app_state.sync', writeStateToSql);

export async function saveCloudAppState(state, options = {}) {
  const clientUpdatedAt = Number.isFinite(options.clientUpdatedAt) ? options.clientUpdatedAt : Date.now();
  const resolvedState = typeof options.mergeState === 'function'
    ? options.mergeState(null, state)
    : state;

  try {
    return await writeStateToSql(resolvedState, {
      ...options,
      clientUpdatedAt,
    });
  } catch (error) {
    await enqueueOutboxMutation({
      type: 'app_state.sync',
      payload: resolvedState,
    });
    return resolvedState;
  }
}

registerOutboxHandler('signal.publish', async (payload) => {
  const supabase = ensureSupabaseClient();
  await supabase.from('client_mutations').insert(payload).throwOnError();
});

export async function publishCloudSyncSignal(signal) {
  if (!isCloudWriteEnabled || !signal || typeof signal !== 'object') return null;
  const clientUpdatedAt = Math.round(Number.isFinite(signal.clientUpdatedAt) ? signal.clientUpdatedAt : Date.now());
  const payload = {
    client_event_id: signal.clientEventId || `signal-${clientUpdatedAt}-${Math.random().toString(36).slice(2, 8)}`,
    mutation_type: signal.reason || 'state-signal',
    client_updated_at_ms: clientUpdatedAt,
    payload: {
      domain: signal.domain || signal.table || null,
      ...signal,
      clientUpdatedAt,
    },
  };

  try {
    const supabase = ensureSupabaseClient();
    await supabase.from('client_mutations').insert(payload).throwOnError();
    return signal;
  } catch (error) {
    await enqueueOutboxMutation({
      type: 'signal.publish',
      payload,
    });
    return signal;
  }
}

export {
  CLOUD_STATE_SCHEMA_VERSION,
  isCloudSyncEnabled,
  isCloudWriteEnabled,
  uploadCloudDataUrlAsset,
};
