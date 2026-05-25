/*
Tujuan: Mencabut akses operasional profil SmartPatrol SQL.
Caller: AppContextRuntime saat ADMIN disable user.
Dependensi: Supabase service role, profiles, dan admin guard.
Main Functions: Set status disabled/enabled false dan tulis audit event.
Side Effects: Menulis profiles dan audit_events.
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
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'disabled', enabled: false })
      .or(`auth_uid.eq.${uid},id.eq.${uid}`);
    if (error) throw error;

    await supabase.from('audit_events').insert({
      actor_id: actor.id,
      event_type: 'profile.revoke',
      entity_table: 'profiles',
      entity_id: uid,
      payload,
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'revoke failed';
    return jsonResponse({ error: message }, message === 'unauthenticated' ? 401 : 403);
  }
});
