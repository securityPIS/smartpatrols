/*
Tujuan: Helper bersama Supabase Edge Functions SmartPatrol SQL.
Caller: Edge Functions auth/access/upload/provision.
Dependensi: Supabase JS Deno runtime dan environment Supabase.
Main Functions: CORS, response JSON, service client, auth user resolver, admin guard, dan normalisasi payload.
Side Effects: Membaca env dan query tabel profiles untuk otorisasi.
*/

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.0';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export function handleOptions(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service role belum dikonfigurasi.');
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function sanitizeString(value: unknown, maxLength = 120) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, maxLength);
}

export function sanitizeEmail(value: unknown) {
  return sanitizeString(value, 160).toLowerCase();
}

export function normalizeRole(value: unknown) {
  const role = sanitizeString(value, 20).toUpperCase();
  return ['ADMIN', 'PIC', 'PETUGAS'].includes(role) ? role : 'PETUGAS';
}

export function normalizeStatus(value: unknown, role = 'PETUGAS', shipAssigned = '') {
  const status = sanitizeString(value, 20).toLowerCase();
  if (status === 'disabled') return 'disabled';
  if (role === 'ADMIN' || role === 'PIC') return status === 'off-duty' ? 'off-duty' : 'active';
  if (!shipAssigned) return 'off-duty';
  return status === 'active' ? 'active' : 'off-duty';
}

export function computeEnabled(role: string, status: string, shipAssigned = '') {
  if (status === 'disabled') return false;
  if (role === 'ADMIN' || role === 'PIC') return true;
  return status === 'active' && Boolean(shipAssigned);
}

export async function getAuthUser(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('unauthenticated');

  const supabase = getServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new Error('unauthenticated');
  return data.user;
}

export async function findProfileForUser(user: { id: string; email?: string | null }) {
  const supabase = getServiceClient();
  const candidates = [
    { column: 'auth_uid', value: user.id },
    { column: 'id', value: user.id },
    { column: 'email', value: sanitizeEmail(user.email || '') },
  ].filter(item => item.value);

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq(candidate.column, candidate.value)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  return null;
}

export async function assertAdmin(request: Request) {
  const user = await getAuthUser(request);
  const profile = await findProfileForUser(user);
  if (!profile || profile.role !== 'ADMIN' || profile.enabled !== true || profile.review_state !== 'approved') {
    throw new Error('permission-denied');
  }
  return { user, profile };
}

export function profileToAccess(profile: Record<string, unknown>) {
  return {
    uid: String(profile.auth_uid || profile.id || ''),
    email: sanitizeEmail(profile.email),
    name: sanitizeString(profile.name, 80),
    role: normalizeRole(profile.role),
    status: sanitizeString(profile.status, 20).toLowerCase(),
    shipAssigned: sanitizeString(profile.ship_assigned, 80) || null,
    type: sanitizeString(profile.type, 20) || 'BUJP',
    workerNumber: sanitizeString(profile.worker_number, 40),
    legacyUserId: sanitizeString(profile.id, 160) || null,
    reviewState: sanitizeString(profile.review_state, 20).toLowerCase() || 'approved',
    enabled: Boolean(profile.enabled),
    updatedAt: profile.updated_at || null,
  };
}

export function buildProfileRow(payload: Record<string, unknown>, fallback: Record<string, unknown> = {}) {
  const role = normalizeRole(payload.role || fallback.role);
  const shipAssigned = sanitizeString(payload.shipAssigned || payload.ship_assigned || fallback.shipAssigned || fallback.ship_assigned, 80);
  const status = normalizeStatus(payload.status || fallback.status, role, shipAssigned);
  const uid = sanitizeString(payload.uid || payload.auth_uid || fallback.uid || fallback.auth_uid, 160);
  const email = sanitizeEmail(payload.email || fallback.email);
  const id = sanitizeString(payload.legacyUserId || payload.id || fallback.legacyUserId || fallback.id || uid, 160);

  return {
    id,
    auth_uid: uid || null,
    email,
    name: sanitizeString(payload.name || fallback.name || email.split('@')[0] || 'Personil', 80),
    role,
    status,
    ship_assigned: shipAssigned || null,
    type: sanitizeString(payload.type || fallback.type || 'BUJP', 20) || 'BUJP',
    worker_number: sanitizeString(payload.workerNumber || payload.worker_number || fallback.workerNumber || fallback.worker_number, 40),
    review_state: sanitizeString(payload.reviewState || payload.review_state || fallback.reviewState || fallback.review_state || 'approved', 20).toLowerCase(),
    enabled: computeEnabled(role, status, shipAssigned),
    source: sanitizeString(payload.source || fallback.source || 'manual', 40) || 'manual',
  };
}
