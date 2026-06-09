/*
Tujuan: Mencegah regresi notifikasi temuan yang tidak menarget admin saat profil admin tidak terlihat klien.
Caller: Node test runner saat verifikasi notifikasi lintas-role.
Dependensi: AppContextRuntime, cloudState adapter, dan migration get_admin_recipient_ids.
Main Functions: Mengunci resolver admin server-side dan memastikan PIC tetap memakai logika per kapal lama.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtimeSource = readFileSync(
  new URL('../../src/context/AppContextRuntime.jsx', import.meta.url),
  'utf8',
);
const cloudStateSource = readFileSync(
  new URL('../../src/services/backend/cloudState.js', import.meta.url),
  'utf8',
);
const migrationSource = readFileSync(
  new URL('../../supabase/migrations/202606080001_admin_notification_recipient_ids.sql', import.meta.url),
  'utf8',
);

test('temuan memakai resolver admin server-side tanpa mengubah target PIC per kapal', () => {
  assert.match(
    runtimeSource,
    /fetchAdminRecipientIds/,
    'runtime harus memuat id admin dari adapter cloudState',
  );
  assert.match(
    runtimeSource,
    /adminRecipientIdsRef\.current\.forEach\(\(adminId\) => recipients\.add\(adminId\)\)/,
    'getShipRecipients harus menambahkan id admin server-side saat includeAdmins aktif',
  );
  assert.match(
    runtimeSource,
    /includePic && user\.role === ACCESS_ROLES\.PIC && user\.shipAssigned === shipName/,
    'PIC harus tetap mengikuti logika lama: hanya PIC kapal yang sama',
  );
  assert.match(
    runtimeSource,
    /type: 'incident_created'[\s\S]*?targetUserIds: getShipRecipients\(operationalShipName, \{ includeAdmins: true, includePic: true, includePetugas: true \}\)/,
    'notifikasi temuan patroli harus tetap meminta admin, PIC, dan petugas sekapal',
  );
});

test('RPC admin recipient hanya mengekspos id admin aktif', () => {
  assert.match(
    cloudStateSource,
    /supabase\.rpc\('get_admin_recipient_ids'\)/,
    'adapter harus memanggil RPC get_admin_recipient_ids',
  );
  assert.match(
    migrationSource,
    /create or replace function public\.get_admin_recipient_ids\(\)/,
    'migration harus membuat RPC get_admin_recipient_ids',
  );
  assert.match(
    migrationSource,
    /public\.has_operational_access\(\)/,
    'RPC harus digerbang akses operasional',
  );
  assert.match(
    migrationSource,
    /p\.role = 'ADMIN'/,
    'RPC hanya menarget ADMIN',
  );
  assert.doesNotMatch(
    migrationSource,
    /p\.role = 'PIC'/,
    'RPC tidak boleh menarget PIC lintas-kapal pada tahap ini',
  );
});
