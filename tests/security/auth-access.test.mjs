import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ACCESS_ROLES,
  buildOperationalAccessPayload,
  buildPendingRegistrationPayload,
} from '../../src/services/backend/accessModels.js';
import {
  OPERATIONAL_ACCESS_ERROR_KIND,
  classifyOperationalAccessResolveError,
  getOperationalAccessResolveErrorMessage,
} from '../../src/services/backend/accessErrors.js';

const authSource = readFileSync(new URL('../../src/services/backend/auth.js', import.meta.url), 'utf8');
const accessSource = readFileSync(new URL('../../src/services/backend/access.js', import.meta.url), 'utf8');
const cloudStateSource = readFileSync(new URL('../../src/services/backend/cloudState.js', import.meta.url), 'utf8');
const appContextSource = readFileSync(new URL('../../src/context/AppContextRuntime.jsx', import.meta.url), 'utf8');
const syncAccessSource = readFileSync(new URL('../../supabase/functions/sync-operational-access/index.ts', import.meta.url), 'utf8');
const registrationMigrationSource = readFileSync(new URL('../../supabase/migrations/202605250001_fix_registration_profile_sync.sql', import.meta.url), 'utf8');
const photoRepairMigrationSource = readFileSync(new URL('../../supabase/migrations/20260618024500_repair_truncated_profile_photo_urls.sql', import.meta.url), 'utf8');
const photoGuardMigrationSource = readFileSync(new URL('../../supabase/migrations/20260618031500_guard_profile_photo_url_overwrite.sql', import.meta.url), 'utf8');
const pendingUpdatePolicySource = readFileSync(new URL('../../supabase/migrations/202605250002_fix_rls_policies_and_triggers.sql', import.meta.url), 'utf8');
const sharedEdgeSource = readFileSync(new URL('../../supabase/functions/_shared/smartpatrol.ts', import.meta.url), 'utf8');

function createFunctionError({ name = 'FunctionsHttpError', message = 'Edge Function returned a non-2xx status code', status = null, code = '' } = {}) {
  const error = new Error(message);
  error.name = name;
  if (code) error.code = code;
  if (status) error.context = { status };
  return error;
}

test('pending registration payload tetap membuang field sensitif dan approval field liar', () => {
  const longSignedPhotoUrl = `https://hsquavmbeaawywpebafw.supabase.co/storage/v1/object/sign/registration-assets/uid-public-1/profile/avatar-1770000000000.webp?token=${'a'.repeat(520)}`;
  const payload = buildPendingRegistrationPayload({
    uid: 'uid-public-1',
    email: 'PUBLIC@EXAMPLE.COM',
    name: '  Petugas Baru  ',
    phone: '0812-3456-7890',
    photoUrl: longSignedPhotoUrl,
    role: ACCESS_ROLES.ADMIN,
    shipAssigned: 'MT MENGGALA',
    status: 'pending',
    reviewNote: 'should-not-stick',
  });

  assert.equal(payload.uid, 'uid-public-1');
  assert.equal(payload.email, 'public@example.com');
  assert.equal(payload.name, 'Petugas Baru');
  assert.equal(payload.phone, '081234567890');
  assert.equal(payload.photoUrl, longSignedPhotoUrl);
  assert.equal(payload.status, 'pending');
  assert.equal(payload.reviewNote, 'should-not-stick');
  assert.equal(Object.hasOwn(payload, 'role'), false);
  assert.equal(Object.hasOwn(payload, 'shipAssigned'), false);
});

test('akses petugas off-duty tanpa assignment tidak langsung enabled', () => {
  const payload = buildOperationalAccessPayload({
    uid: 'uid-guard-1',
    email: 'guard@example.com',
    name: 'Guard One',
    role: ACCESS_ROLES.PETUGAS,
    status: 'off-duty',
    shipAssigned: '',
  });

  assert.equal(payload.role, ACCESS_ROLES.PETUGAS);
  assert.equal(payload.status, 'off-duty');
  assert.equal(payload.shipAssigned, null);
  assert.equal(payload.enabled, false);
});

test('admin operasional selalu enabled saat review approved', () => {
  const payload = buildOperationalAccessPayload({
    uid: 'uid-admin-1',
    email: 'admin@smartpatrol.local',
    name: 'Admin One',
    role: ACCESS_ROLES.ADMIN,
    status: 'active',
  });

  assert.equal(payload.role, ACCESS_ROLES.ADMIN);
  assert.equal(payload.enabled, true);
  assert.equal(payload.reviewState, 'approved');
});

test('registrasi publik membawa metadata khusus untuk trigger onboarding Supabase Auth', () => {
  assert.match(
    authSource,
    /options:\s*Object\.keys\(metadata\s*\|\|\s*\{\}\)\.length\s*>\s*0[\s\S]*\{\s*data:\s*metadata\s*\}/,
    'signUp harus meneruskan metadata terkontrol ke Supabase Auth',
  );
  assert.match(
    appContextSource,
    /smartpatrol_registration_flow:\s*'public'/,
    'flow register publik harus memberi marker agar trigger tidak menangkap user admin/provisioned',
  );
  assert.match(
    registrationMigrationSource,
    /after insert on auth\.users[\s\S]*create_pending_registration_from_auth_user/,
    'migration harus membuat pending registration dari auth.users saat session signUp tidak tersedia',
  );
});

test('pending registration client upsert mempertahankan photo_url di atas stub trigger', () => {
  assert.match(
    accessSource,
    /\.from\(PENDING_REGISTRATIONS_TABLE\)[\s\S]*\.upsert\(payload,\s*\{\s*onConflict:\s*'uid'\s*\}\)/,
    'client harus memakai upsert agar photo_url/photo_path tidak hilang saat trigger auth sudah membuat stub tanpa foto',
  );
  assert.match(
    pendingUpdatePolicySource,
    /create policy "pending_owner_update" on public\.pending_registrations[\s\S]*uid = auth\.uid\(\)::text and status = 'pending'/,
    'upsert client bergantung pada RLS pending_owner_update agar pemilik bisa melengkapi barisnya sendiri',
  );
});

test('foto user admin diunggah ke storage durabel lalu disinkronkan ke profiles.photo_url', () => {
  // Foto profil yang baru dipilih masih berupa key idb:// lokal. Harus diunggah jadi URL
  // durabel terikat auth_uid (lewat uploadRegistrationPhotoAsset, domain registration) sebelum
  // sinkron, agar profiles.photo_url terisi dan avatar muncul lintas-perangkat.
  assert.match(
    appContextSource,
    /const resolveDurableUserPhotoUrl = useCallback\(async \(photoUrl, authUid\) => \{[\s\S]*?uploadRegistrationPhotoAsset\(\{ uid: safeAuthUid, photoUrl \}\)/,
    'helper foto user harus mengunggah idb:// ke storage durabel terikat auth_uid sebelum sinkron',
  );
  assert.match(
    appContextSource,
    /await syncOperationalUserAccess\(\{[\s\S]*?photoUrl: savedUserPhoto\.syncPhotoUrl,[\s\S]*?\}\);/,
    'sinkron akses user admin harus menyertakan photoUrl agar profiles.photo_url terisi',
  );
  // Jalur outbox offline menulis profiles langsung; photo_url wajib ikut agar avatar tak hilang.
  assert.match(
    accessSource,
    /photo_url:\s*sanitizeUrl\(payload\.photoUrl\s*\|\|\s*payload\.photo_url\s*\|\|\s*''\)\s*\|\|\s*null/,
    'payload outbox profile.upsert harus membawa photo_url durabel',
  );
  // buildProfileRow (helper Edge Function) sudah menulis photo_url dari payload; pastikan kontrak ini tetap ada.
  assert.match(
    sharedEdgeSource.replace(/\s+/g, ' '),
    /photo_url: sanitizePhotoUrl\(payload\.photoUrl \|\| payload\.photo_url/,
    'buildProfileRow harus tetap menulis photo_url dari payload sync',
  );
});

test('edge access tidak memotong signed URL foto profil Supabase', () => {
  assert.match(
    sharedEdgeSource,
    /const MAX_PHOTO_URL_LENGTH = 4096;/,
    'signed URL Supabase Storage bisa lebih dari 500 karakter, jadi batas foto harus longgar',
  );
  assert.match(
    sharedEdgeSource.replace(/\s+/g, ' '),
    /photoUrl: sanitizePhotoUrl\(profile\.photo_url\) \|\| null/,
    'resolve access harus mengembalikan photo_url penuh tanpa memotong token signed URL',
  );
  assert.doesNotMatch(
    sharedEdgeSource,
    /photo_(?:url|Url)[\s\S]{0,80}sanitizeString\([^)]*,\s*500\)/,
    'photo_url tidak boleh lagi memakai sanitizer 500 karakter karena memotong JWT Storage',
  );
});

test('migration repair avatar tidak memotong trigger photo_url dan memulihkan token terpotong', () => {
  assert.match(
    photoRepairMigrationSource,
    /metadata->>'photo_url'[\s\S]*?,\s*4096\)/,
    'trigger onboarding terbaru harus menerima signed URL panjang agar tidak memotong token Storage',
  );
  assert.doesNotMatch(
    photoRepairMigrationSource,
    /metadata->>'photo_url'[\s\S]*?,\s*500\)/,
    'migration repair tidak boleh memakai batas 500 karakter untuk photo_url',
  );
  assert.match(
    photoRepairMigrationSource,
    /update public\.profiles as profile[\s\S]*set photo_url = asset\.signed_url[\s\S]*length\(split_part\(split_part\(profile\.photo_url, 'token=', 2\), '\.', 3\)\) < 43/,
    'profiles.photo_url yang tokennya terpotong harus diperbaiki dari media_assets.signed_url lengkap',
  );
});

test('state sync tidak menimpa avatar profile yang sudah lengkap dengan URL rusak', () => {
  assert.match(
    cloudStateSource,
    /function shouldPreserveExistingProfilePhotoUrl\(nextUrl = '', existingUrl = ''\)/,
    'writer profiles harus punya guard preserve avatar existing',
  );
  assert.match(
    cloudStateSource,
    /isLikelyCompleteSignedStorageUrl\(existingUrl\)[\s\S]*getSignedUrlTokenSignatureLength\(nextUrl\) < 43/,
    'signed URL lengkap di DB tidak boleh ditimpa signed URL lokal yang tokennya terpotong',
  );
  assert.match(
    cloudStateSource,
    /function mergeRowForSafeUpsert\(table, nextRow = \{\}, existingRow = \{\}\)[\s\S]*table !== 'profiles'[\s\S]*photo_url: existingRow\.photo_url/,
    'rekonsiliasi aman hanya berlaku untuk profiles dan mempertahankan photo_url existing',
  );
  assert.match(
    cloudStateSource,
    /safeRows\.map\(\(row\) => \{[\s\S]*mergeRowForSafeUpsert\(table, row, existing\)[\s\S]*areDbRowsEquivalent\(row, existing, keys\)/,
    'filterChangedRowsById harus membandingkan row yang sudah diproteksi sebelum upsert',
  );
  assert.match(
    photoGuardMigrationSource,
    /create or replace function public\.check_profile_update\(\)[\s\S]*new\.photo_url := old\.photo_url;/,
    'trigger profiles harus mempertahankan photo_url DB yang sudah lengkap dari downgrade client lama',
  );
  assert.match(
    photoGuardMigrationSource,
    /new\.photo_url like 'idb:\/\/%'[\s\S]*new\.photo_url like 'data:image\/%'[\s\S]*length\(split_part\(split_part\(coalesce\(new\.photo_url, ''\), 'token=', 2\), '\.', 3\)\) < 43/,
    'guard DB harus menolak aset lokal dan signed URL yang tokennya terpotong',
  );
});

test('sync operational access mempertahankan profile id existing berdasarkan auth_uid', () => {
  assert.match(
    syncAccessSource,
    /findExistingProfile\(supabase,\s*proposedRow\)/,
    'sync harus mencari row existing sebelum upsert agar tidak bentrok unique auth_uid',
  );
  assert.match(
    syncAccessSource,
    /legacyUserId:\s*existingProfile\.id/,
    'upsert harus memakai id profile existing saat auth_uid/email sudah ada di database',
  );
});

test('state sync merekonsiliasi id profile sebelum upsert profiles', () => {
  assert.match(
    cloudStateSource,
    /await\s+reconcileProfileRowIds\(supabase,\s*profileRows\)/,
    'cloud state sync harus memakai id profile cloud existing sebelum upsert',
  );
  assert.match(
    cloudStateSource,
    /Pertahankan primary key profile cloud/,
    'rekonsiliasi id perlu terdokumentasi karena mencegah unique auth_uid conflict',
  );
});

test('listener auth tidak mengubah gagal jaringan menjadi logout final', () => {
  assert.match(
    authSource,
    /supabase\.auth\.getSession\(\)/,
    'initial session harus membaca sesi lokal Supabase agar cold-start offline tidak bergantung getUser network',
  );
  assert.doesNotMatch(
    authSource,
    /supabase\.auth\.getUser\(\)[\s\S]*?catch\(\(\)\s*=>\s*\{[\s\S]*?callback\(null\)/,
    'kegagalan getUser network tidak boleh langsung diterjemahkan menjadi user null/logout',
  );
  assert.match(
    authSource,
    /event:\s*'INITIAL_SESSION_ERROR'[\s\S]*?isTransient:\s*true/,
    'error restore awal harus transien agar context tidak menghapus sesi saat data mati diam-diam',
  );
  assert.match(
    authSource,
    /event:\s*'INITIAL_SESSION'[\s\S]*?isTransient:\s*!normalizedUser/,
    'INITIAL_SESSION null harus transien meski navigator.onLine masih true',
  );
  assert.match(
    authSource,
    /explicitFirebaseLogout\s*=\s*true[\s\S]*supabase\.auth\.signOut\(\)[\s\S]*explicitFirebaseLogout\s*=\s*false/,
    'logout eksplisit harus men-set flag selama signOut agar SIGNED_OUT yang menyusul dikenali eksplisit',
  );
  assert.match(
    authSource,
    /const isExplicitLogout\s*=\s*event\s*===\s*'SIGNED_OUT'\s*&&\s*explicitFirebaseLogout/,
    'listener harus membedakan SIGNED_OUT eksplisit dari auth-null involunter',
  );
  assert.match(
    authSource,
    /isTransient:\s*!normalizedUser\s*&&\s*!isExplicitLogout\s*&&\s*\(isBrowserOffline\(\)\s*\|\|\s*event\s*===\s*'SIGNED_OUT'\)/,
    'SIGNED_OUT involunter / browser offline harus transien; hanya logout eksplisit yang final',
  );
});

test('classifier resolve access membedakan timeout, http fatal, dan error platform', () => {
  assert.equal(
    classifyOperationalAccessResolveError(createFunctionError({
      code: 'resolve-operational-access-timeout',
      message: 'resolve-operational-access-timeout',
    })),
    OPERATIONAL_ACCESS_ERROR_KIND.TRANSIENT,
  );
  assert.equal(
    classifyOperationalAccessResolveError(createFunctionError({ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' })),
    OPERATIONAL_ACCESS_ERROR_KIND.TRANSIENT,
  );
  assert.equal(
    classifyOperationalAccessResolveError(createFunctionError({ name: 'FunctionsRelayError', message: 'Relay Error invoking the Edge Function' })),
    OPERATIONAL_ACCESS_ERROR_KIND.TRANSIENT,
  );
  assert.equal(
    classifyOperationalAccessResolveError(createFunctionError({ status: 503 })),
    OPERATIONAL_ACCESS_ERROR_KIND.TRANSIENT,
  );
  assert.equal(
    classifyOperationalAccessResolveError(createFunctionError({ status: 401 })),
    OPERATIONAL_ACCESS_ERROR_KIND.FATAL_AUTH,
  );
  assert.equal(
    classifyOperationalAccessResolveError(createFunctionError({ status: 403 })),
    OPERATIONAL_ACCESS_ERROR_KIND.AMBIGUOUS,
  );
});

test('mapper auth memberi pesan khusus untuk error Edge Function', () => {
  assert.equal(
    getOperationalAccessResolveErrorMessage(createFunctionError({
      code: 'resolve-operational-access-timeout',
      message: 'resolve-operational-access-timeout',
    })),
    'Server akses lambat merespons. Validasi akses sedang dicoba ulang.',
  );
  assert.equal(
    getOperationalAccessResolveErrorMessage(createFunctionError({ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' })),
    'Jaringan gagal menjangkau server akses SmartPatrol. Periksa koneksi internet.',
  );
  assert.equal(
    getOperationalAccessResolveErrorMessage(createFunctionError({ name: 'FunctionsRelayError', message: 'Relay Error invoking the Edge Function' })),
    'Server akses SmartPatrol sedang bermasalah. Coba lagi sebentar.',
  );
  assert.equal(
    getOperationalAccessResolveErrorMessage(createFunctionError({ status: 403 })),
    'Server akses SmartPatrol belum bisa memvalidasi akun. Coba lagi sebentar.',
  );
  assert.equal(
    getOperationalAccessResolveErrorMessage(createFunctionError({ status: 401 })),
    'Sesi Supabase tidak valid. Silakan login ulang.',
  );
  assert.equal(
    getOperationalAccessResolveErrorMessage(createFunctionError({ name: 'AuthApiError', message: 'Invalid login credentials', status: 400 })),
    '',
    'mapper akses tidak boleh mengambil alih error auth biasa seperti password salah',
  );
});

test('login auth sukses tidak membuka app atau signOut saat resolve access transien', () => {
  assert.match(
    appContextSource,
    /const LOGIN_ACCESS_RESOLVE_RETRY_DELAYS_MS = \[600, 1500\];/,
    'login harus punya retry pendek sebelum menyerah ke fallback background',
  );
  assert.match(
    appContextSource,
    /const accessResult = await resolveOperationalAccessForLogin\(\);/,
    'handleLogin harus memakai helper resolve login yang punya retry terbatas',
  );
  assert.match(
    appContextSource,
    /if \(credential\?\.user\) \{[\s\S]*?const kind = classifyOperationalAccessResolveError\(error\);[\s\S]*?if \(kind !== ACCESS_RESOLVE_ERROR_KIND_FATAL_AUTH\) \{/,
    'catch handleLogin harus membedakan auth sukses + resolve transien dari error kredensial/fatal',
  );
  assert.match(
    appContextSource,
    /if \(kind !== ACCESS_RESOLVE_ERROR_KIND_FATAL_AUTH\) \{[\s\S]*?setAuthAccessState\(null\);[\s\S]*?setAuthAccessResolvedUid\(''\);[\s\S]*?setAuthAccessOfflineUid\(currentUid\);[\s\S]*?setAuthAccessResolveNonce\(\(nonce\) => nonce \+ 1\);[\s\S]*?setAuthNotice\(`Login Supabase berhasil\. \$\{getFirebaseAuthErrorMessage\(error\)\}`\);[\s\S]*?return;/,
    'resolve transien harus mempertahankan Supabase session, menahan app login, dan memicu background re-resolve',
  );
  assert.doesNotMatch(
    appContextSource,
    /if \(kind !== ACCESS_RESOLVE_ERROR_KIND_FATAL_AUTH\) \{[\s\S]*?finalizeAuthorizedLogin\(/,
    'login fresh tidak boleh membuka app hanya karena Supabase Auth sudah sukses',
  );
});

test('runtime auth mempertahankan sesi patroli saat auth-null offline', () => {
  assert.match(
    appContextSource,
    /const isTransientAuthNull = !nextUser\s*&& !authEvent\?\.explicit\s*&& \(authEvent\?\.isTransient \|\| isOfflineRef\.current\)[\s\S]*?return;/,
    'callback auth-null transien (non-eksplisit) harus berhenti sebelum setFirebaseAuthUser(null)',
  );
  assert.match(
    appContextSource,
    /const offlineSessionUser = isOffline && sessionUserId && sessionUserRecord[\s\S]*?return offlineSessionUser;/,
    'currentUserRecord harus tetap memakai sessionUserRecord saat offline dan auth cloud belum tersedia',
  );
  assert.match(
    appContextSource,
    /if \(isOffline\) \{[\s\S]*?setAuthAccessOfflineUid\(offlineUid\);[\s\S]*?return;[\s\S]*?resetAuthSession\('Sesi cloud Anda telah berakhir/,
    'validator tidak boleh reset sesi cloud ketika device sedang offline dan masih ada user lokal aktif',
  );
});

test('validator sesi hanya reset saat resolusi akses DEFINITIF (anti tendangan reconnect)', () => {
  // Reset cloud session hanya boleh saat resolveOperationalAccess memberi jawaban definitif
  // untuk UID aktif. Resolusi gagal jaringan (authAccessOfflineUid di-set) saat baru pulih
  // koneksi TIDAK boleh memicu reset — itulah penyebab logout "saat back online".
  const definitiveGuards = appContextSource.match(
    /const hasDefinitiveResolvedUid = Boolean\(currentUid\) && authAccessResolvedUid === currentUid;[\s\S]{0,220}?if \(!hasDefinitiveResolvedUid\)[\s\S]{0,220}?resetAuthSession\('Sesi cloud Anda telah berakhir/g,
  ) || [];
  assert.equal(
    definitiveGuards.length,
    2,
    'kedua validator harus menolak UID kosong sebelum resetAuthSession',
  );
  assert.doesNotMatch(
    appContextSource,
    /if \(authAccessResolvedUid !== currentUid\)[\s\S]{0,220}?resetAuthSession\('Sesi cloud Anda telah berakhir/,
    'guard lama bisa lolos saat currentUid dan resolvedUid sama-sama kosong',
  );
  assert.doesNotMatch(
    appContextSource,
    /authAccessResolvedUid !== currentUid && authAccessOfflineUid !== currentUid\) return;\s*\n\s*resetAuthSession/,
    'guard lama yang ikut reset saat offlineUid cocok harus dihapus (penyebab logout reconnect)',
  );
  assert.match(
    appContextSource,
    /if \(!shipsData\?\.length\) \{\s*clearPendingSessionValidationLogout\(\);\s*return;/,
    'validasi armada petugas harus ditunda saat ships belum termuat agar tidak kick di window reconnect',
  );
});

test('validator sesi menunda hard logout dari status operasional yang bisa transient', () => {
  assert.match(
    appContextSource,
    /const SESSION_VALIDATION_LOGOUT_DELAY_MS = 5000;/,
    'hard logout dari validator sesi harus memakai settle window 5 detik',
  );
  assert.match(
    appContextSource,
    /const sessionValidationLogoutRef = useRef\(\{ timer: null, key: '' \}\);/,
    'validator sesi harus menyimpan pending logout dalam ref agar bisa dibatalkan saat state pulih',
  );
  assert.match(
    appContextSource,
    /const scheduleSessionValidationLogout = useCallback\(\(\{ key, message \}\) => \{[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?handleLogout\(message\);[\s\S]*?SESSION_VALIDATION_LOGOUT_DELAY_MS/,
    'hard logout harus dijadwalkan, bukan dipanggil langsung dari kondisi transient',
  );
  assert.doesNotMatch(
    appContextSource,
    /if \(authAccessStatus === 'restricted'\) \{\s*handleLogout\(/,
    'restricted dari resolver tidak boleh langsung hard signOut tanpa settle',
  );
  assert.doesNotMatch(
    appContextSource,
    /if \(!canUserAccessApplication\(activeUser\)\) \{\s*handleLogout\(/,
    'status user data-driven tidak boleh langsung hard signOut tanpa settle',
  );
  assert.match(
    appContextSource,
    /if \(activeUser\.role === ACCESS_ROLES\.PETUGAS && !assignedShipForCurrentUser\) \{[\s\S]*?scheduleSessionValidationLogout\(\{[\s\S]*?key: `fleet:\$\{validationBaseKey\}`/,
    'validasi armada PETUGAS harus dijadwalkan agar snapshot realtime yang transient bisa pulih',
  );
});

test('resolusi akses sembuh sendiri setelah reconnect (checkpoint tidak hilang)', () => {
  // Resolver akses harus bisa di-ulang lewat nonce, dan ada retry berbackoff saat
  // resolusi gagal jaringan agar authAccessState (sumber shipAssigned/status) pulih
  // tanpa refresh manual. Tanpa ini, currentUserRecord null -> operationalShip null
  // -> "Belum ada titik patroli" sampai user refresh.
  assert.match(
    appContextSource,
    /\}, \[firebaseAuthReady, firebaseAuthUser, authAccessResolveNonce\]\);/,
    'effect resolver akses harus bergantung pada authAccessResolveNonce agar bisa di-retry',
  );
  assert.match(
    appContextSource,
    /authAccessRetryRef[\s\S]*?setTimeout\([\s\S]*?setAuthAccessResolveNonce\(\(nonce\) => nonce \+ 1\)/,
    'harus ada retry resolusi akses berbackoff yang menaikkan authAccessResolveNonce',
  );
  // currentUserRecord tidak boleh kolaps ke null saat resolusi belum definitif —
  // pertahankan record terakhir agar operationalShip & checkpoint tetap tampil.
  assert.match(
    appContextSource,
    /const isAccessResolutionDefinitive = authAccessResolvedUid === firebaseAuthUid;\s*\n\s*if \(isAccessResolutionDefinitive\) return offlineSessionUser;/,
    'currentUserRecord hanya boleh kolaps ke null saat resolusi akses sudah definitif',
  );
});
