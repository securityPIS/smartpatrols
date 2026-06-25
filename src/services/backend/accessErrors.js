/*
Tujuan: Mengklasifikasi error resolve akses operasional Supabase agar login tidak salah logout.
Caller: Adapter auth/access dan AppContextRuntime saat login atau re-resolve akses.
Dependensi: Bentuk error supabase-js Edge Functions dan Error standar browser.
Main Functions: Membaca status FunctionsHttpError, membedakan transient/fatal/ambigu, dan memetakan pesan akses.
Side Effects: Tidak ada; seluruh helper bersifat pure.
*/

const OPERATIONAL_ACCESS_ERROR_KIND = Object.freeze({
  TRANSIENT: 'transient',
  FATAL_AUTH: 'fatal-auth',
  AMBIGUOUS: 'ambiguous',
});

function normalizeErrorText(value) {
  return String(value || '').trim().toLowerCase();
}

function getSupabaseFunctionErrorStatus(error) {
  const candidates = [
    error?.context?.status,
    error?.context?.statusCode,
    error?.status,
    error?.statusCode,
  ];

  for (const candidate of candidates) {
    const status = Number(candidate);
    if (Number.isInteger(status) && status >= 100 && status <= 599) return status;
  }
  return null;
}

function getOperationalAccessErrorText(error) {
  return [
    error?.code,
    error?.name,
    error?.message,
    error?.constructor?.name,
  ]
    .map(normalizeErrorText)
    .filter(Boolean)
    .join(' ');
}

function isSupabaseFunctionResolveError(error) {
  const text = getOperationalAccessErrorText(error);
  return (
    text.includes('resolve-operational-access-timeout')
    || text.includes('functionshttperror')
    || text.includes('functionsfetcherror')
    || text.includes('functionsrelayerror')
    || text.includes('edge function')
    || text.includes('non-2xx status code')
    || text.includes('failed to send a request')
    || text.includes('relay error')
  );
}

function classifyOperationalAccessResolveError(error) {
  const text = getOperationalAccessErrorText(error);
  const status = getSupabaseFunctionErrorStatus(error);

  if (text.includes('resolve-operational-access-timeout')) {
    return OPERATIONAL_ACCESS_ERROR_KIND.TRANSIENT;
  }
  if (
    text.includes('functionsfetcherror')
    || text.includes('functionsrelayerror')
    || text.includes('failed to send a request')
    || text.includes('relay error')
    || text.includes('failed to fetch')
    || text.includes('network')
    || text.includes('fetch')
  ) {
    return OPERATIONAL_ACCESS_ERROR_KIND.TRANSIENT;
  }
  if (status >= 500) {
    return OPERATIONAL_ACCESS_ERROR_KIND.TRANSIENT;
  }
  if (
    status === 401
    || text.includes('unauthenticated')
    || text.includes('invalid jwt')
    || text.includes('jwt expired')
    || text.includes('session invalid')
    || text.includes('invalid session')
  ) {
    return OPERATIONAL_ACCESS_ERROR_KIND.FATAL_AUTH;
  }
  return OPERATIONAL_ACCESS_ERROR_KIND.AMBIGUOUS;
}

function getOperationalAccessResolveErrorMessage(error) {
  if (!isSupabaseFunctionResolveError(error)) return '';

  const text = getOperationalAccessErrorText(error);
  const status = getSupabaseFunctionErrorStatus(error);

  if (text.includes('resolve-operational-access-timeout')) {
    return 'Server akses lambat merespons. Validasi akses sedang dicoba ulang.';
  }
  if (text.includes('functionsfetcherror') || text.includes('failed to send a request') || text.includes('failed to fetch')) {
    return 'Jaringan gagal menjangkau server akses SmartPatrol. Periksa koneksi internet.';
  }
  if (text.includes('functionsrelayerror') || text.includes('relay error')) {
    return 'Server akses SmartPatrol sedang bermasalah. Coba lagi sebentar.';
  }
  if (text.includes('functionshttperror') || text.includes('non-2xx status code') || status) {
    if (status === 401) return 'Sesi Supabase tidak valid. Silakan login ulang.';
    return 'Server akses SmartPatrol belum bisa memvalidasi akun. Coba lagi sebentar.';
  }
  return '';
}

export {
  OPERATIONAL_ACCESS_ERROR_KIND,
  classifyOperationalAccessResolveError,
  getOperationalAccessResolveErrorMessage,
  getSupabaseFunctionErrorStatus,
};
