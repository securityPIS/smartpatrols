/*
Tujuan: Menyediakan wrapper Supabase Auth kompatibel dengan flow auth SmartPatrol lama.
Caller: AppContextRuntime, LoginPage, dan form admin yang butuh login/register/provision akun.
Dependensi: Supabase Auth dan Edge Function provision-operational-user untuk pembuatan user oleh admin.
Main Functions: Login/register email-password, provision user operasional, logout, subscribe auth state, dan normalisasi error.
Side Effects: Membuat/menghapus sesi Supabase Auth aktif dan dapat memanggil Edge Function service-role terproteksi.
*/

import { ensureSupabaseClient, isSupabaseConfigured, normalizeSupabaseUser } from './app';

function getFirebaseAuthErrorMessage(error) {
  const code = String(error?.code || error?.message || '').toLowerCase();

  if (code === 'supabase-not-configured') {
    return 'Supabase belum dikonfigurasi pada aplikasi ini.';
  }
  if (code.includes('user already registered') || code.includes('already')) {
    return 'Email ini sudah terdaftar di Supabase Auth.';
  }
  if (code.includes('invalid login') || code.includes('invalid credentials')) {
    return 'Email atau password Supabase tidak cocok.';
  }
  if (code.includes('email')) {
    return 'Format email tidak valid atau belum terverifikasi.';
  }
  if (code.includes('password')) {
    return 'Password minimal 8 karakter.';
  }
  if (code.includes('network') || code.includes('fetch')) {
    return 'Jaringan gagal menjangkau Supabase. Periksa koneksi internet.';
  }
  if (code.includes('permission') || code.includes('forbidden')) {
    return 'Akses Anda ditolak oleh kebijakan keamanan SmartPatrol.';
  }
  return 'Autentikasi Supabase gagal diproses.';
}

async function loginWithFirebaseEmail(email, password) {
  const supabase = ensureSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return {
    ...data,
    user: normalizeSupabaseUser(data.user),
  };
}

async function registerWithFirebaseEmail(email, password) {
  const supabase = ensureSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return {
    ...data,
    user: normalizeSupabaseUser(data.user),
  };
}

async function provisionFirebaseEmailUser({ email, password, displayName = '' }) {
  const supabase = ensureSupabaseClient();
  const { data, error } = await supabase.functions.invoke('provision-operational-user', {
    body: {
      email,
      password,
      displayName,
    },
  });
  if (error) throw error;
  return {
    ...data,
    user: normalizeSupabaseUser(data?.user),
  };
}

async function logoutFirebaseUser() {
  if (!isSupabaseConfigured) return;
  const supabase = ensureSupabaseClient();
  await supabase.auth.signOut();
}

function subscribeToFirebaseAuthChanges(callback) {
  if (!isSupabaseConfigured) return () => {};
  const supabase = ensureSupabaseClient();
  let disposed = false;

  supabase.auth.getUser()
    .then(({ data }) => {
      if (!disposed) callback(normalizeSupabaseUser(data?.user));
    })
    .catch(() => {
      if (!disposed) callback(null);
    });

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(normalizeSupabaseUser(session?.user));
  });

  return () => {
    disposed = true;
    data?.subscription?.unsubscribe?.();
  };
}

export {
  getFirebaseAuthErrorMessage,
  isSupabaseConfigured as isFirebaseAuthEnabled,
  loginWithFirebaseEmail,
  logoutFirebaseUser,
  provisionFirebaseEmailUser,
  registerWithFirebaseEmail,
  subscribeToFirebaseAuthChanges,
};
