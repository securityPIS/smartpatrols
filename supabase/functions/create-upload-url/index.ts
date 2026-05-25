/*
Tujuan: Membuat signed upload URL untuk aset operasional/registrasi SmartPatrol SQL.
Caller: Client atau integrasi server yang butuh path upload terkontrol.
Dependensi: Supabase service role, Storage, dan admin/operational guard.
Main Functions: Validasi auth, sanitize path, dan createSignedUploadUrl.
Side Effects: Membuat token upload satu kali di Supabase Storage.
*/

import {
  findProfileForUser,
  getAuthUser,
  getServiceClient,
  handleOptions,
  jsonResponse,
  readJsonBody,
  sanitizeString,
} from '../_shared/smartpatrol.ts';

function segment(value: unknown, fallback = 'item') {
  return sanitizeString(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/(^-|-$)/g, '') || fallback;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const user = await getAuthUser(request);
    const payload = await readJsonBody(request);
    const bucket = payload.bucket === 'registration-assets' ? 'registration-assets' : 'operational-assets';

    if (bucket === 'operational-assets') {
      const profile = await findProfileForUser(user);
      if (!profile || profile.enabled !== true || profile.review_state !== 'approved') {
        throw new Error('permission-denied');
      }
    }

    const path = [
      bucket === 'registration-assets' ? user.id : segment(payload.domain || 'operational'),
      segment(payload.ownerId || user.id),
      segment(payload.fileName || `asset-${Date.now()}`),
    ].join('/');

    const supabase = getServiceClient();
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
    if (error) throw error;

    return jsonResponse({
      bucket,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'upload url failed';
    return jsonResponse({ error: message }, message === 'unauthenticated' ? 401 : 403);
  }
});
