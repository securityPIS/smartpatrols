/*
Tujuan: Menolak registrasi publik SmartPatrol SQL.
Caller: AppContextRuntime UsersPage saat ADMIN menolak registrasi.
Dependensi: Supabase service role, pending_registrations, dan admin guard.
Main Functions: Update status rejected dan tulis audit event.
Side Effects: Menulis pending_registrations dan audit_events.
*/

import {
  assertAdmin,
  getServiceClient,
  handleOptions,
  jsonResponse,
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
    const { error } = await supabase.from('pending_registrations').update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor.id,
      review_note: String(payload.reviewNote || '').slice(0, 240),
    }).eq('uid', uid);
    if (error) throw error;

    await supabase.from('audit_events').insert({
      actor_id: actor.id,
      event_type: 'pending_registration.reject',
      entity_table: 'pending_registrations',
      entity_id: uid,
      payload,
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'reject failed';
    return jsonResponse({ error: message }, message === 'unauthenticated' ? 401 : 403);
  }
});
