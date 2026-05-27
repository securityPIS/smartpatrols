/*
Tujuan: Approval onboarding publik menjadi profil operasional Supabase.
Caller: AppContextRuntime UsersPage saat ADMIN menyetujui registrasi.
Dependensi: Supabase service role, pending_registrations, profiles, dan admin guard.
Main Functions: Update pending status approved, upsert profile PETUGAS, dan tulis audit event.
Side Effects: Menulis pending_registrations, profiles, dan audit_events.
*/

import {
  assertAdmin,
  buildProfileRow,
  getServiceClient,
  handleOptions,
  jsonResponse,
  profileToAccess,
  readJsonBody,
} from '../_shared/smartpatrol.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { profile: actor } = await assertAdmin(request);
    const payload = await readJsonBody(request);
    const uid = String(payload.uid || payload.id || '').trim();
    if (!uid) throw new Error('uid-required');

    const supabase = getServiceClient();
    const { data: pending, error: pendingError } = await supabase
      .from('pending_registrations')
      .select('*')
      .eq('uid', uid)
      .single();
    if (pendingError) throw pendingError;

    const row = buildProfileRow({
      uid,
      id: payload.legacyUserId || uid,
      email: pending.email,
      name: payload.name || pending.name,
      role: payload.role || 'PETUGAS',
      status: payload.status || 'off-duty',
      shipAssigned: payload.shipAssigned || '',
      type: pending.type,
      workerNumber: pending.worker_number,
      photoUrl: pending.photo_url,
      reviewState: 'approved',
      source: 'onboarding',
    });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single();
    if (profileError) throw profileError;

    // Konfirmasi email di auth.users jika disetujui
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(uid, {
      email_confirm: true,
    });
    if (authUpdateError) throw authUpdateError;

    await supabase.from('pending_registrations').update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor.id,
      review_note: String(payload.reviewNote || '').slice(0, 240),
    }).eq('uid', uid);

    await supabase.from('audit_events').insert({
      actor_id: actor.id,
      event_type: 'pending_registration.approve',
      entity_table: 'pending_registrations',
      entity_id: uid,
      payload: { profileId: profile.id },
    });

    return jsonResponse({ access: profileToAccess(profile), profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'approve failed';
    return jsonResponse({ error: message }, message === 'unauthenticated' ? 401 : 403);
  }
});
