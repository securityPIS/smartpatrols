/*
Tujuan: Menyediakan onboarding dan otorisasi operasional berbasis Supabase/Postgres.
Caller: AppContextRuntime untuk registrasi publik, approval admin, dan resolve akses sesi.
Dependensi: Supabase Auth/Functions/Postgres, adapter aset, dan utilitas sanitasi.
Main Functions: Membuat pending registration, subscribe pending list, resolve access, approval/reject/revoke, dan sync profil operasional.
Side Effects: Menulis tabel pending_registrations/profiles, memanggil Edge Functions security, dan upload aset registrasi.
*/

import { sanitizeEmail, sanitizePhone, sanitizeText, sanitizeUrl } from '../../utils/sanitize';
import { ensureSupabaseClient } from './app';
import { buildRegistrationAssetPath, uploadRegistrationPhotoAsset } from './assets';
import { enqueueOutboxMutation, registerOutboxHandler } from './outbox';

const PENDING_REGISTRATIONS_TABLE = 'pending_registrations';
const USER_ACCESS_TABLE = 'profiles';

function isDuplicateKeyError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key');
}

function mapPendingRegistration(row = {}) {
  return {
    id: sanitizeText(row.id || row.uid || '', 160) || '',
    uid: sanitizeText(row.uid || row.id || '', 160) || '',
    email: sanitizeEmail(row.email || ''),
    name: sanitizeText(row.name || '', 80) || 'User Pending',
    phone: sanitizePhone(row.phone || ''),
    photoUrl: sanitizeUrl(row.photo_url || row.photoUrl || '') || '',
    photoPath: sanitizeText(row.photo_path || row.photoPath || '', 240) || '',
    type: sanitizeText(row.type || 'BUJP', 20) || 'BUJP',
    workerNumber: sanitizeText(row.worker_number || row.workerNumber || '', 40) || '',
    status: sanitizeText(row.status || 'pending', 20).toLowerCase() || 'pending',
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
    reviewedAt: row.reviewed_at || row.reviewedAt || null,
    reviewedBy: sanitizeText(row.reviewed_by || row.reviewedBy || '', 160) || '',
    reviewNote: sanitizeText(row.review_note || row.reviewNote || '', 240) || '',
  };
}

function mapOperationalProfilePayload(payload = {}) {
  const role = sanitizeText(payload.role || 'PETUGAS', 20).toUpperCase();
  const status = sanitizeText(payload.status || 'off-duty', 20).toLowerCase();
  const shipAssigned = sanitizeText(payload.shipAssigned || payload.ship_assigned || '', 80) || null;
  const calculatedEnabled = status !== 'disabled' && (role !== 'PETUGAS' || Boolean(shipAssigned));

  return {
    id: sanitizeText(payload.legacyUserId || payload.id || payload.uid || '', 160) || sanitizeText(payload.uid || '', 160),
    auth_uid: sanitizeText(payload.uid || payload.firebaseUid || '', 160) || null,
    email: sanitizeEmail(payload.email || ''),
    name: sanitizeText(payload.name || '', 80) || 'Personil',
    role,
    status,
    ship_assigned: shipAssigned,
    type: sanitizeText(payload.type || 'BUJP', 20) || 'BUJP',
    worker_number: sanitizeText(payload.workerNumber || '', 40) || '',
    review_state: sanitizeText(payload.reviewState || 'approved', 20).toLowerCase(),
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : calculatedEnabled,
    source: sanitizeText(payload.source || 'manual', 40) || 'manual',
  };
}

async function invokeFunction(name, payload = {}) {
  const supabase = ensureSupabaseClient();
  const { data, error } = await supabase.functions.invoke(name, { body: payload });
  if (error) throw error;
  return data || null;
}

export async function createPendingRegistration(registration) {
  const supabase = ensureSupabaseClient();
  const uid = sanitizeText(registration?.uid || '', 160);
  if (!uid) throw new Error('pending-registration-uid-required');

  const payload = {
    uid,
    email: sanitizeEmail(registration?.email || ''),
    name: sanitizeText(registration?.name || '', 80) || 'User Baru',
    phone: sanitizePhone(registration?.phone || ''),
    photo_url: sanitizeUrl(registration?.photoUrl || '') || '',
    photo_path: sanitizeText(registration?.photoPath || '', 240) || '',
    type: sanitizeText(registration?.type || 'BUJP', 20) || 'BUJP',
    worker_number: sanitizeText(registration?.workerNumber || '', 40) || '',
    status: 'pending',
  };

  try {
    const { error } = await supabase
      .from(PENDING_REGISTRATIONS_TABLE)
      .insert(payload);
    if (isDuplicateKeyError(error)) {
      return {
        ...registration,
        status: 'pending',
      };
    }
    if (error) throw error;
  } catch (error) {
    await enqueueOutboxMutation({
      type: 'pending_registration.upsert',
      payload,
    });
    throw error;
  }

  return {
    ...registration,
    status: 'pending',
  };
}

registerOutboxHandler('pending_registration.upsert', async (payload) => {
  const supabase = ensureSupabaseClient();
  const { error } = await supabase
    .from(PENDING_REGISTRATIONS_TABLE)
    .insert(payload);
  if (isDuplicateKeyError(error)) return;
  if (error) throw error;
});

export function subscribeToPendingRegistrations(callback, onError) {
  const supabase = ensureSupabaseClient();
  let disposed = false;

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from(PENDING_REGISTRATIONS_TABLE)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!disposed) callback((data || []).map(mapPendingRegistration));
  };

  fetchRows().catch(onError);

  const channel = supabase.channel('pending-registrations')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: PENDING_REGISTRATIONS_TABLE,
    }, () => {
      fetchRows().catch(onError);
    })
    .subscribe();

  return () => {
    disposed = true;
    supabase.removeChannel(channel);
  };
}

export async function resolveOperationalAccess() {
  return invokeFunction('resolve-operational-access');
}

export async function syncOperationalUserAccess(payload) {
  const mappedPayload = mapOperationalProfilePayload(payload);
  try {
    return await invokeFunction('sync-operational-access', payload);
  } catch (error) {
    await enqueueOutboxMutation({
      type: 'profile.upsert',
      payload: mappedPayload,
    });
    throw error;
  }
}

registerOutboxHandler('profile.upsert', async (payload) => {
  const supabase = ensureSupabaseClient();
  const { error } = await supabase
    .from(USER_ACCESS_TABLE)
    .upsert(payload, { onConflict: 'id' });
  if (error) throw error;
});

export async function approvePendingRegistration(payload) {
  return invokeFunction('approve-pending-registration', payload);
}

export async function rejectPendingRegistration(payload) {
  return invokeFunction('reject-pending-registration', payload);
}

export async function revokeOperationalUserAccess(payload) {
  return invokeFunction('revoke-operational-access', payload);
}

export {
  buildRegistrationAssetPath,
  PENDING_REGISTRATIONS_TABLE as PENDING_REGISTRATIONS_COLLECTION,
  USER_ACCESS_TABLE as USER_ACCESS_COLLECTION,
  uploadRegistrationPhotoAsset,
};
