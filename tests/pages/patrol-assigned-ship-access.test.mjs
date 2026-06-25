/*
Tujuan: Mencegah regresi bug "checkpoint kosong (0/0) untuk petugas walau header tampil nama
        kapal". Akar masalah: pencocokan nama kapal yang rapuh (exact '=') antara
        profiles.ship_assigned dan ships.name membuat operationalShip null → daftar checkpoint
        kosong. Perbaikan: createShipNameKey() menormalkan nama (trim + collapse whitespace +
        lowercase) dan resolveAssignedShipForUser() memakainya; PatrolPage memberi pesan
        eksplisit "Kapal Tidak Dapat Diakses" alih-alih "Belum ada titik patroli" yang menyesatkan.
Caller: Node test runner (node --test tests/pages/*.mjs).
Dependensi: src/context/AppContextRuntime.jsx, src/pages/PatrolPage.jsx (dibaca read-only).
Side Effects: Tidak ada.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtimeSource = readFileSync(
  new URL('../../src/context/AppContextRuntime.jsx', import.meta.url),
  'utf8',
);
const patrolPageSource = readFileSync(
  new URL('../../src/pages/PatrolPage.jsx', import.meta.url),
  'utf8',
);

test('createShipNameKey menormalkan nama kapal (trim + collapse whitespace + lowercase)', () => {
  assert.match(
    runtimeSource,
    /function createShipNameKey\(name\)\s*\{[\s\S]*?\.trim\(\)[\s\S]*?\.replace\(\/\\s\+\/g, ' '\)[\s\S]*?\.toLowerCase\(\)/,
    'createShipNameKey harus trim, collapse whitespace, dan lowercase agar tahan selisih sepele',
  );
});

test('resolveAssignedShipForUser mencocokkan kapal lewat kunci ternormalisasi, bukan exact equal', () => {
  const fnMatch = runtimeSource.match(/function resolveAssignedShipForUser\(user, ships = \[\]\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fnMatch, 'resolveAssignedShipForUser harus ada');
  const fnBody = fnMatch[0];

  assert.match(
    fnBody,
    /createShipNameKey\(ship\?\.name\) === assignedKey/,
    'filter kapal harus memakai createShipNameKey, bukan perbandingan nama mentah',
  );
  // Pastikan exact-match nama mentah tidak lagi jadi satu-satunya filter penentu.
  assert.doesNotMatch(
    fnBody,
    /\.filter\(\(ship\) => ship\?\.name === safeShipAssigned\)/,
    'filter exact-equal lama harus sudah diganti pencocokan ternormalisasi',
  );
});

test('isAssignedShipInaccessible dihitung & diekspos lewat ShipContext', () => {
  assert.match(
    runtimeSource,
    /const isAssignedShipInaccessible = useMemo\(\(\) => Boolean\([\s\S]*?isPetugas[\s\S]*?cloudSyncBootstrapped[\s\S]*?!operationalShip,?\s*\)/,
    'flag inaccessible harus butuh petugas + cloud sudah bootstrap + operationalShip null',
  );
  assert.match(
    runtimeSource,
    /const shipValue = useMemo\(\(\) => \(\{[\s\S]*?isAssignedShipInaccessible,/,
    'ShipContext harus mengekspos isAssignedShipInaccessible',
  );
  assert.match(
    runtimeSource,
    /const shipValue = useMemo\(\(\) => \(\{[\s\S]*?isWaitingForAssignedFleetSync,/,
    'ShipContext harus mengekspos isWaitingForAssignedFleetSync untuk membedakan state loading',
  );
});

test('PatrolPage memberi pesan eksplisit saat kapal tertugas tidak dapat diakses', () => {
  assert.match(
    patrolPageSource,
    /isAssignedShipInaccessible/,
    'PatrolPage harus memakai flag isAssignedShipInaccessible',
  );
  assert.match(
    patrolPageSource,
    /Kapal Tidak Dapat Diakses/,
    'PatrolPage harus menampilkan judul pesan kapal tidak dapat diakses',
  );
  // Pesan generik lama tetap dipertahankan untuk kasus kapal valid tanpa checkpoint.
  assert.match(
    patrolPageSource,
    /Belum ada titik patroli yang tersedia\./,
    'pesan generik tetap ada untuk kapal valid tanpa titik patroli',
  );
});
