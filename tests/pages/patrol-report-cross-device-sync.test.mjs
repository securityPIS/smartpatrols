/*
Tujuan: Mencegah regresi bug sinkronisasi hasil patroli lintas-device — laporan completed/missed
        yang tak cocok dengan definisi checkpoint kapal di device penerima TIDAK boleh dibuang
        (kalau dibuang, hasil "aman" lenyap sementara "temuan" tetap tampak lewat tabel incidents).
Caller: Node test runner saat verifikasi rekonstruksi state patroli.
Dependensi: src/context/AppContextRuntime.jsx.
Main Functions: Memastikan normalizeShipScopedCheckpoints & migrateCheckpointStateToCurrentShift
        mempertahankan laporan resolved (completed/missed) yang orphan.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../src/context/AppContextRuntime.jsx', import.meta.url),
  'utf8',
);

test('isResolvedResultCheckpoint mengenali status final completed/missed', () => {
  assert.match(
    source,
    /function isResolvedResultCheckpoint\(checkpoint\)\s*\{[\s\S]*?status === 'completed'[\s\S]*?status === 'missed'[\s\S]*?resultType === 'missed'/,
    'helper harus menganggap completed/missed sebagai hasil final yang dilindungi',
  );
});

test('normalizeShipScopedCheckpoints mempertahankan orphan completed/missed', () => {
  assert.match(
    source,
    /const orphanResultCheckpoints = safeCheckpoints[\s\S]*?\.filter\(isResolvedResultCheckpoint\)/,
    'normalizeShipScopedCheckpoints harus mengumpulkan orphan hasil patroli',
  );
  assert.match(
    source,
    /return \[\.\.\.normalizedBaseCheckpoints, \.\.\.temporaryCheckpoints, \.\.\.orphanResultCheckpoints\]/,
    'orphan hasil patroli harus ikut dikembalikan, bukan dibuang',
  );
});

test('migrateCheckpointStateToCurrentShift membawa orphan ke history/live, bukan membuangnya', () => {
  assert.match(
    source,
    /const currentOrphanCheckpoints = \[\]/,
    'migrate harus menyiapkan penampung orphan shift berjalan',
  );
  assert.match(
    source,
    /savedCheckpoints\.forEach\(\(savedCheckpoint\) => \{[\s\S]*?isResolvedResultCheckpoint\(savedCheckpoint\)/,
    'migrate harus memproses orphan completed/missed dari savedCheckpoints',
  );
  assert.match(
    source,
    /collection\[ship\.id\] = \[\.\.\.normalizedBaseCheckpoints, \.\.\.currentTemporaryCheckpoints, \.\.\.currentOrphanCheckpoints\]/,
    'orphan shift berjalan harus disambung ke daftar checkpoint live kapal',
  );
});
