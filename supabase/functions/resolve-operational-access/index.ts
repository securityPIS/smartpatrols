/*
Tujuan: Resolve akses operasional user login dari tabel profiles/pending_registrations.
Caller: AppContextRuntime setelah Supabase Auth login atau cold-start auth restore.
Dependensi: Supabase service role, profiles, dan pending_registrations.
Main Functions: Mengembalikan access/profile approved, atau status pending/rejected/tanpa akses.
Side Effects: Tidak ada write.
*/

import {
  findProfileForUser,
  getAuthUser,
  getServiceClient,
  handleOptions,
  jsonResponse,
  profileToAccess,
  sanitizeEmail,
} from '../_shared/smartpatrol.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const user = await getAuthUser(request);
    const profile = await findProfileForUser(user);
    if (profile) {
      const access = profileToAccess(profile);
      return jsonResponse({
        status: access.reviewState,
        access: access.enabled && access.reviewState === 'approved' ? access : null,
        profile: {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          status: profile.status,
          shipAssigned: profile.ship_assigned,
          type: profile.type,
          workerNumber: profile.worker_number,
          photoUrl: profile.photo_url,
          updatedAt: profile.updated_at,
        },
      });
    }

    const supabase = getServiceClient();
    const email = sanitizeEmail(user.email || '');
    const { data: pending, error } = await supabase
      .from('pending_registrations')
      .select('*')
      .or(`uid.eq.${user.id},email.eq.${email}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return jsonResponse({
      status: pending?.status || 'missing',
      access: null,
      profile: pending || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'resolve failed';
    return jsonResponse({ error: message }, message === 'unauthenticated' ? 401 : 403);
  }
});
