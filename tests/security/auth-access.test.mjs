import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ACCESS_ROLES,
  buildOperationalAccessPayload,
  buildPendingRegistrationPayload,
} from '../../src/services/backend/accessModels.js';

const authSource = readFileSync(new URL('../../src/services/backend/auth.js', import.meta.url), 'utf8');
const accessSource = readFileSync(new URL('../../src/services/backend/access.js', import.meta.url), 'utf8');
const cloudStateSource = readFileSync(new URL('../../src/services/backend/cloudState.js', import.meta.url), 'utf8');
const appContextSource = readFileSync(new URL('../../src/context/AppContextRuntime.jsx', import.meta.url), 'utf8');
const syncAccessSource = readFileSync(new URL('../../supabase/functions/sync-operational-access/index.ts', import.meta.url), 'utf8');
const registrationMigrationSource = readFileSync(new URL('../../supabase/migrations/202605250001_fix_registration_profile_sync.sql', import.meta.url), 'utf8');

test('pending registration payload tetap membuang field sensitif dan approval field liar', () => {
  const payload = buildPendingRegistrationPayload({
    uid: 'uid-public-1',
    email: 'PUBLIC@EXAMPLE.COM',
    name: '  Petugas Baru  ',
    phone: '0812-3456-7890',
    role: ACCESS_ROLES.ADMIN,
    shipAssigned: 'MT MENGGALA',
    status: 'pending',
    reviewNote: 'should-not-stick',
  });

  assert.equal(payload.uid, 'uid-public-1');
  assert.equal(payload.email, 'public@example.com');
  assert.equal(payload.name, 'Petugas Baru');
  assert.equal(payload.phone, '081234567890');
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

test('pending registration client insert aman terhadap duplikasi dari trigger auth', () => {
  assert.match(
    accessSource,
    /\.from\(PENDING_REGISTRATIONS_TABLE\)[\s\S]*\.insert\(payload\)/,
    'client harus memakai insert biasa agar tidak membutuhkan UPDATE policy pending_registrations',
  );
  assert.match(
    accessSource,
    /isDuplicateKeyError\(error\)/,
    'duplicate dari trigger auth harus dianggap idempotent, bukan gagal registrasi',
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
    /isTransientAuthError\(error\)/,
    'error auth jaringan harus ditandai transien agar context tidak menghapus sesi offline',
  );
  assert.match(
    authSource,
    /isTransient:\s*!normalizedUser\s*&&\s*isBrowserOffline\(\)/,
    'auth-null ketika browser offline harus dikirim sebagai event transien, bukan logout eksplisit',
  );
});

test('runtime auth mempertahankan sesi patroli saat auth-null offline', () => {
  assert.match(
    appContextSource,
    /const isTransientAuthNull = !nextUser && \(authEvent\?\.isTransient \|\| isOfflineRef\.current\)[\s\S]*?return;/,
    'callback auth-null transien harus berhenti sebelum setFirebaseAuthUser(null)',
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
