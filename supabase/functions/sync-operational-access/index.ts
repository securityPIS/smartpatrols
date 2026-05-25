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

async function findExistingProfile(supabase: ReturnType<typeof getServiceClient>, row: Record<string, unknown>) {
  const candidates = [
    { column: 'auth_uid', value: row.auth_uid },
    { column: 'email', value: row.email },
    { column: 'id', value: row.id },
  ].filter((candidate) => candidate.value);

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

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { profile: actor } = await assertAdmin(request);
    const payload = await readJsonBody(request);
    const supabase = getServiceClient();
    const proposedRow = buildProfileRow(payload);
    const existingProfile = await findExistingProfile(supabase, proposedRow);
    const row = existingProfile
      ? buildProfileRow({
        ...payload,
        id: existingProfile.id,
        legacyUserId: existingProfile.id,
      }, existingProfile)
      : proposedRow;

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
