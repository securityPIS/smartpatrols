/*
Tujuan: Menyediakan normalisasi payload security untuk onboarding dan akses operasional SmartPatrol SQL.
Caller: Edge Functions Supabase, adapter client, dan smoke test security repo.
Dependensi: Tidak ada dependensi eksternal selain runtime JavaScript.
Main Functions: Menyaring payload pending registration, menormalkan akses operasional, dan menghitung flag enabled akses.
Side Effects: Tidak ada; modul ini murni untuk transformasi data.
*/

export const ACCESS_ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  PIC: 'PIC',
  PETUGAS: 'PETUGAS',
});

export const ACCESS_STATUSES = Object.freeze({
  ACTIVE: 'active',
  OFF_DUTY: 'off-duty',
  DISABLED: 'disabled',
});

function sanitizeString(value, maxLength = 120) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeEmailValue(value) {
  return sanitizeString(value, 160).toLowerCase();
}

export function sanitizePhoneValue(value) {
  return sanitizeString(value, 40).replace(/[^0-9+]/g, '').slice(0, 20);
}

export function normalizeOperationalRole(role) {
  const normalized = sanitizeString(role, 20).toUpperCase();
  if (Object.values(ACCESS_ROLES).includes(normalized)) {
    return normalized;
  }
  return ACCESS_ROLES.PETUGAS;
}

export function normalizeOperationalStatus(status, role = ACCESS_ROLES.PETUGAS, shipAssigned = '') {
  const normalized = sanitizeString(status, 20).toLowerCase();
  if (normalized === ACCESS_STATUSES.DISABLED) return ACCESS_STATUSES.DISABLED;
  if (role === ACCESS_ROLES.ADMIN || role === ACCESS_ROLES.PIC) {
    return normalized === ACCESS_STATUSES.OFF_DUTY ? ACCESS_STATUSES.OFF_DUTY : ACCESS_STATUSES.ACTIVE;
  }
  if (!shipAssigned) return ACCESS_STATUSES.OFF_DUTY;
  return normalized === ACCESS_STATUSES.ACTIVE ? ACCESS_STATUSES.ACTIVE : ACCESS_STATUSES.OFF_DUTY;
}

export function computeOperationalAccessEnabled(payload = {}) {
  const role = normalizeOperationalRole(payload.role);
  const shipAssigned = sanitizeString(payload.shipAssigned, 80);
  const status = normalizeOperationalStatus(payload.status, role, shipAssigned);

  if (status === ACCESS_STATUSES.DISABLED) return false;
  if (role === ACCESS_ROLES.ADMIN || role === ACCESS_ROLES.PIC) return true;
  return status === ACCESS_STATUSES.ACTIVE && Boolean(shipAssigned);
}

export function buildPendingRegistrationPayload(payload = {}) {
  return {
    uid: sanitizeString(payload.uid, 160),
    email: sanitizeEmailValue(payload.email),
    name: sanitizeString(payload.name, 80) || 'User Baru',
    phone: sanitizePhoneValue(payload.phone),
    photoUrl: sanitizeString(payload.photoUrl, 500),
    photoPath: sanitizeString(payload.photoPath, 240),
    type: sanitizeString(payload.type, 20) || 'BUJP',
    workerNumber: sanitizeString(payload.workerNumber, 40),
    status: sanitizeString(payload.status, 20).toLowerCase() || 'pending',
    reviewNote: sanitizeString(payload.reviewNote, 240),
  };
}

export function buildOperationalAccessPayload(payload = {}) {
  const uid = sanitizeString(payload.uid, 160);
  const email = sanitizeEmailValue(payload.email);
  const name = sanitizeString(payload.name, 80) || email.split('@')[0] || 'Personil';
  const shipAssigned = sanitizeString(payload.shipAssigned, 80);
  const role = normalizeOperationalRole(payload.role);
  const status = normalizeOperationalStatus(payload.status, role, shipAssigned);
  const reviewState = sanitizeString(payload.reviewState, 20).toLowerCase() || 'approved';

  return {
    uid,
    email,
    name,
    role,
    status,
    shipAssigned: shipAssigned || null,
    type: sanitizeString(payload.type, 20) || 'BUJP',
    workerNumber: sanitizeString(payload.workerNumber, 40),
    legacyUserId: sanitizeString(payload.legacyUserId, 160) || null,
    source: sanitizeString(payload.source, 40) || 'manual',
    reviewState,
    enabled: computeOperationalAccessEnabled({
      role,
      shipAssigned,
      status,
    }),
  };
}
