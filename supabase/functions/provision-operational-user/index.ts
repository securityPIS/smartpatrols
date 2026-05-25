/*
Tujuan: Membuat akun Supabase Auth untuk user operasional oleh ADMIN.
Caller: AppContextRuntime saat admin mengisi password pada form user.
Dependensi: Supabase service role, auth.admin, dan admin guard.
Main Functions: Create user email/password tanpa menimpa sesi admin client.
Side Effects: Membuat akun Auth baru di Supabase.
*/

import {
  assertAdmin,
  getServiceClient,
  handleOptions,
  jsonResponse,
  readJsonBody,
  sanitizeEmail,
  sanitizeString,
} from '../_shared/smartpatrol.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    await assertAdmin(request);
    const payload = await readJsonBody(request);
    const email = sanitizeEmail(payload.email);
    const password = sanitizeString(payload.password, 120);
    const displayName = sanitizeString(payload.displayName, 80);
    if (!email || password.length < 8) throw new Error('invalid-user-credential');

    const supabase = getServiceClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        name: displayName,
      },
    });
    if (error) throw error;

    return jsonResponse({
      user: {
        ...data.user,
        uid: data.user?.id,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'provision failed';
    return jsonResponse({ error: message }, message === 'unauthenticated' ? 401 : 403);
  }
});
