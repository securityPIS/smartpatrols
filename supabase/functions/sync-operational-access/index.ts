/*
Tujuan: Sinkronisasi profil operasional oleh admin ke tabel profiles.
Caller: AppContextRuntime saat admin membuat/mengubah user atau assignment kapal.
Dependensi: Supabase service role dan admin guard.
Main Functions: Validasi admin, normalisasi payload, dan upsert profiles.
Side Effects: Menulis profiles dan audit_events.
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
    const row = buildProfileRow(payload);
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('profiles')
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;

    await supabase.from('audit_events').insert({
      actor_id: actor.id,
      event_type: 'profile.sync',
      entity_table: 'profiles',
      entity_id: row.id,
      payload: { role: row.role, status: row.status, shipAssigned: row.ship_assigned },
    });

    return jsonResponse({ access: profileToAccess(data), profile: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sync failed';
    return jsonResponse({ error: message }, message === 'unauthenticated' ? 401 : 403);
  }
});
