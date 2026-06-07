/*
Tujuan: Adapter SQL/Realtime untuk insiden, SOS durable, dan update temuan SmartPatrol.
Caller: AppContextRuntime saat submit/update/delete insiden dan listener lintas-device.
Dependensi: Supabase Postgres/Reatime dan outbox IndexedDB.
Main Functions: Subscribe insiden dengan delta merge, upsert payload insiden idempotent,
        persist/resolve SOS, append progress/dokumentasi, dan delete admin.
Side Effects: Membaca/menulis tabel incidents, sos_alerts, notifications, serta
        mengantre mutation offline bila jaringan gagal.
*/

import { ensureSupabaseClient } from './app';
import { enqueueOutboxMutation, registerOutboxHandler } from './outbox';
import { deleteStorageAsset } from './assets';

const INCIDENTS_TABLE = 'incidents';
const SOS_ALERTS_TABLE = 'sos_alerts';
const INCIDENTS_SCHEMA_VERSION = 1;
const INCIDENTS_LISTEN_LIMIT = 200;
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

function mapIncidentToRow(incident = {}, options = {}) {
  const clientUpdatedAt = Number.isFinite(options.clientUpdatedAt)
    ? options.clientUpdatedAt
    : Date.now();

  const payload = {
    ...incident,
    schemaVersion: INCIDENTS_SCHEMA_VERSION,
    clientUpdatedAt,
  };

  return {
    id: String(incident.id || incident.incidentId || ''),
    client_event_id: incident.clientEventId || incident.client_event_id || String(incident.id || incident.incidentId || ''),
    ship_name: String(incident.shipName || ''),
    status: incident.status || 'open',
    location: incident.location || '',
    reported_by: incident.reportedBy || '',
    // Kolom *_ms bertipe bigint: paksa integer (performance.now() bisa berkoma → ditolak Postgres).
    occurred_at_trusted_ms: Number.isFinite(incident.occurredAtTrustedMs) ? Math.round(incident.occurredAtTrustedMs) : null,
    client_updated_at_ms: Math.round(clientUpdatedAt),
    photo_url: incident.photoUrl || null,
    payload,
  };
}

function mapRowToIncident(row = {}) {
  return {
    ...(row.payload || {}),
    firestoreId: row.id,
    id: row.id || row.payload?.id || '',
    schemaVersion: row.payload?.schemaVersion || INCIDENTS_SCHEMA_VERSION,
    clientUpdatedAt: row.client_updated_at_ms || row.payload?.clientUpdatedAt || null,
    serverUpdatedAt: row.server_updated_at || row.updated_at || null,
    shipName: row.ship_name || row.payload?.shipName || '',
    status: row.status || row.payload?.status || 'open',
    location: row.location || row.payload?.location || '',
    reportedBy: row.reported_by || row.payload?.reportedBy || '',
    photoUrl: row.photo_url || row.payload?.photoUrl || null,
    progress: row.payload?.progress || [],
    documentation: row.payload?.documentation || [],
  };
}

function mapSosAlertToRow(sos = {}, options = {}) {
  const clientUpdatedAt = Number.isFinite(options.clientUpdatedAt)
    ? options.clientUpdatedAt
    : Date.now();
  const triggeredAt = sos.triggeredAt || sos.createdAt || new Date(clientUpdatedAt).toISOString();
  const payload = {
    ...sos,
    updatedAt: sos.updatedAt || new Date(clientUpdatedAt).toISOString(),
    clientUpdatedAt,
  };

  return {
    id: String(sos.id || ''),
    client_event_id: sos.clientEventId || sos.client_event_id || String(sos.id || ''),
    triggered_by: sos.senderUserId || sos.triggeredBy || null,
    ship_name: String(sos.shipName || ''),
    lat: sos.lat === null || sos.lat === undefined ? '' : String(sos.lat),
    lng: sos.lng === null || sos.lng === undefined ? '' : String(sos.lng),
    status: sos.status || 'active',
    triggered_at: triggeredAt,
    payload,
  };
}

async function createSosAlertDurable(sos, options = {}) {
  const supabase = ensureSupabaseClient();
  const row = mapSosAlertToRow(sos, options);
  if (!row.id || !row.client_event_id) throw new Error('sos-id-required');

  const { data, error } = await supabase.rpc('create_operational_sos_alert', {
    p_sos_id: row.id,
    p_client_event_id: row.client_event_id,
    p_ship_name: row.ship_name,
    p_lat: row.lat || null,
    p_lng: row.lng || null,
    p_payload: row.payload,
  });
  if (error) throw error;
  return data?.sos || row.payload;
}

async function updateSosAlertDurable(sos, options = {}) {
  const supabase = ensureSupabaseClient();
  const row = mapSosAlertToRow(sos, options);
  if (!row.id) throw new Error('sos-id-required');

  const { error } = await supabase
    .from(SOS_ALERTS_TABLE)
    .update({
      status: row.status,
      payload: row.payload,
      lat: row.lat,
      lng: row.lng,
    })
    .eq('id', row.id);
  if (error) throw error;
  return row.payload;
}

async function resolveSosAlertDurable({ sosId, payload = {}, deleted = false } = {}) {
  const supabase = ensureSupabaseClient();
  if (!sosId) throw new Error('sos-id-required');

  const { data, error } = await supabase.rpc('resolve_operational_sos_alert', {
    p_sos_id: sosId,
    p_payload: payload,
    p_deleted: Boolean(deleted),
  });
  if (error) throw error;
  return data?.sos || payload;
}

async function mergeAppendPayload(row, options = {}) {
  const appendProgressItems = Array.isArray(options.appendProgressItems)
    ? options.appendProgressItems.filter(Boolean)
    : [];
  const appendDocumentationItems = Array.isArray(options.appendDocumentationItems)
    ? options.appendDocumentationItems.filter(Boolean)
    : [];

  if (appendProgressItems.length === 0 && appendDocumentationItems.length === 0) {
    return row;
  }

  const supabase = ensureSupabaseClient();
  const { data, error } = await supabase
    .from(INCIDENTS_TABLE)
    .select('payload')
    .eq('id', row.id)
    .maybeSingle();
  if (error) throw error;

  const currentPayload = data?.payload || {};
  return {
    ...row,
    payload: {
      ...currentPayload,
      ...row.payload,
      progress: [
        ...(Array.isArray(currentPayload.progress) ? currentPayload.progress : []),
        ...appendProgressItems,
      ],
      documentation: [
        ...(Array.isArray(currentPayload.documentation) ? currentPayload.documentation : []),
        ...appendDocumentationItems,
      ],
    },
  };
}

async function writeIncidentReport(incident, options = {}) {
  const supabase = ensureSupabaseClient();
  const row = await mergeAppendPayload(mapIncidentToRow(incident, options), options);
  if (!row.id) throw new Error('incident-id-required');

  const { error } = await supabase
    .from(INCIDENTS_TABLE)
    .upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return row.payload;
}

registerOutboxHandler('incident.upsert', writeIncidentReport);
registerOutboxHandler('incident.delete', async ({ incidentId }) => {
  const supabase = ensureSupabaseClient();
  const { error } = await supabase.from(INCIDENTS_TABLE).delete().eq('id', incidentId);
  if (error) throw error;
});
registerOutboxHandler('sos_alert.create', createSosAlertDurable);
registerOutboxHandler('sos_alert.update', updateSosAlertDurable);
registerOutboxHandler('sos_alert.resolve', resolveSosAlertDurable);
registerOutboxHandler('sos_alert.delete', async ({ sosId, payload = {} }) => {
  await resolveSosAlertDurable({ sosId, payload, deleted: true });
});

export function subscribeToIncidents(callback, onError) {
  const supabase = ensureSupabaseClient();
  let disposed = false;
  let currentRows = [];

  const emitCurrent = () => {
    const sortedRows = [...currentRows]
      .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
      .slice(0, INCIDENTS_LISTEN_LIMIT);
    currentRows = sortedRows;
    if (!disposed) callback(sortedRows.map(mapRowToIncident));
  };

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from(INCIDENTS_TABLE)
      .select(INCIDENT_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(INCIDENTS_LISTEN_LIMIT);
    if (error) throw error;
    currentRows = data || [];
    emitCurrent();
  };

  fetchRows().catch(onError);

  const channel = supabase.channel('incidents')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: INCIDENTS_TABLE,
    }, (event) => {
      const nextRow = event.new || null;
      const oldRow = event.old || null;
      const rowId = nextRow?.id || oldRow?.id || null;

      if (!rowId) {
        fetchRows().catch(onError);
        return;
      }

      if (event.eventType === 'DELETE') {
        currentRows = currentRows.filter(row => row.id !== rowId);
        emitCurrent();
        return;
      }

      const index = currentRows.findIndex(row => row.id === rowId);
      if (index >= 0) {
        currentRows = [
          ...currentRows.slice(0, index),
          nextRow,
          ...currentRows.slice(index + 1),
        ];
      } else {
        currentRows = [nextRow, ...currentRows];
      }
      emitCurrent();
    })
    .subscribe();

  return () => {
    disposed = true;
    supabase.removeChannel(channel);
  };
}

export async function saveIncidentReport(incident, options = {}) {
  try {
    return await writeIncidentReport(incident, options);
  } catch (error) {
    await enqueueOutboxMutation({
      type: 'incident.upsert',
      payload: incident,
    });
    return {
      ...incident,
      schemaVersion: INCIDENTS_SCHEMA_VERSION,
      pendingOfflineSync: true,
    };
  }
}

export async function saveSosAlert(sos, options = {}) {
  try {
    return await createSosAlertDurable(sos, options);
  } catch (error) {
    console.error('Gagal menulis SOS durable ke sos_alerts, mengantre ke outbox', {
      code: error?.code,
      message: error?.message,
      sosId: sos?.id || null,
      shipName: sos?.shipName || null,
    });
    await enqueueOutboxMutation({
      id: `sos-create-${sos?.id || Date.now()}`,
      type: 'sos_alert.create',
      payload: sos,
    });
    return {
      ...sos,
      pendingOfflineSync: true,
    };
  }
}

export async function updateSosAlert(sos, options = {}) {
  try {
    return await updateSosAlertDurable(sos, options);
  } catch (error) {
    await enqueueOutboxMutation({
      id: `sos-update-${sos?.id || Date.now()}`,
      type: 'sos_alert.update',
      payload: sos,
    });
    return {
      ...sos,
      pendingOfflineSync: true,
    };
  }
}

export async function resolveSosAlert(sosId, payload = {}, options = {}) {
  try {
    return await resolveSosAlertDurable({
      sosId,
      payload,
      deleted: Boolean(options.deleted),
    });
  } catch (error) {
    await enqueueOutboxMutation({
      id: `sos-resolve-${sosId || Date.now()}`,
      type: 'sos_alert.resolve',
      payload: {
        sosId,
        payload,
        deleted: Boolean(options.deleted),
      },
    });
    return {
      ...payload,
      pendingOfflineSync: true,
    };
  }
}

export async function deleteIncidentReport(incidentId, photoUrl = null) {
  const supabase = ensureSupabaseClient();
  try {
    if (photoUrl) await deleteStorageAsset(photoUrl);
    const { error } = await supabase.from(INCIDENTS_TABLE).delete().eq('id', incidentId);
    if (error) throw error;
    return true;
  } catch (error) {
    await enqueueOutboxMutation({
      type: 'incident.delete',
      payload: { incidentId },
    });
    return false;
  }
}

export async function deleteSosAlert(sosId) {
  if (!sosId) return false;
  const deletedAt = new Date().toISOString();
  try {
    await resolveSosAlertDurable({
      sosId,
      payload: {
        id: sosId,
        status: 'resolved',
        deleted: true,
        deletedAt,
        resolvedAt: deletedAt,
        updatedAt: deletedAt,
      },
      deleted: true,
    });
    return true;
  } catch (error) {
    await enqueueOutboxMutation({
      id: `sos-delete-${sosId}`,
      type: 'sos_alert.delete',
      payload: {
        sosId,
        payload: {
          id: sosId,
          status: 'resolved',
          deleted: true,
          deletedAt,
          resolvedAt: deletedAt,
          updatedAt: deletedAt,
        },
      },
    });
    return false;
  }
}

export { INCIDENTS_SCHEMA_VERSION };
