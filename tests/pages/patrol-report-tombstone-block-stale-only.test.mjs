/*
Tujuan: Mencegah regresi "user submit laporan malah hilang" — trigger/logika tombstone tidak
        boleh membuang laporan patroli BARU, hanya re-upsert BASI (timestamp <= waktu hapus).
Caller: Node test runner saat verifikasi sinkronisasi laporan patroli.
Dependensi: AppContextRuntime, migrasi fix tombstone Supabase.
Main Functions: Memastikan trigger DB & guard klien hanya memblokir laporan basi, bukan laporan baru.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtimeSource = readFileSync(
  new URL('../../src/context/AppContextRuntime.jsx', import.meta.url),
  'utf8',
);
const fixMigrationSource = readFileSync(
  new URL('../../supabase/migrations/20260531120000_fix_patrol_tombstone_block_stale_only.sql', import.meta.url),
  'utf8',
);

test('trigger DB hanya memblokir re-upsert BASI (timestamp <= deleted_at)', () => {
  assert.match(
    fixMigrationSource,
    /create or replace function public\.block_tombstoned_patrol_report/,
    'migrasi fix harus mengganti body trigger block_tombstoned_patrol_report',
  );
  assert.match(
    fixMigrationSource,
    /v_completed_at <= t\.deleted_at/,
    'trigger wajib memakai guard waktu: hanya blok laporan yang dibuat sebelum waktu hapus admin',
  );
});

test('trigger DB TIDAK lagi memblokir blanket 1 jam (akar laporan baru hilang)', () => {
  assert.doesNotMatch(
    fixMigrationSource,
    /interval '1 hour'/,
    'blanket window 1 jam membuang temuan baru di checkpoint yang baru dihapus -> harus dihapus',
  );
  assert.doesNotMatch(
    fixMigrationSource,
    /delete from public\.patrol_reports/i,
    'migrasi fix tidak boleh menghapus baris patrol_reports apa pun (hindari kehilangan data)',
  );
});

test('migrasi fix menonaktifkan trigger liar purge_tombstoned_patrol_finding_surfaces', () => {
  assert.match(
    fixMigrationSource,
    /drop trigger if exists purge_tombstoned_patrol_finding_surfaces_trg on public\.patrol_report_tombstones/,
    'trigger purge yang cascade-delete incidents/history harus di-drop defensif (bisa masih hidup di prod)',
  );
  assert.match(
    fixMigrationSource,
    /drop function if exists public\.purge_tombstoned_patrol_finding_surfaces/,
    'fungsi purge harus di-drop defensif',
  );
});

test('guard klien tombstone tidak me-reset laporan baru pada tombstone natural (shift_key kosong)', () => {
  const startIndex = runtimeSource.indexOf('function shouldApplyPatrolReportTombstoneToCheckpoint');
  assert.notEqual(startIndex, -1, 'fungsi guard tombstone klien harus ada');
  const fnSlice = runtimeSource.slice(startIndex, startIndex + 1200);

  // Bug lama: `if (!tombstoneShiftKey || ...) return true;` -> tombstone natural shift_key=NULL
  // me-reset SEMUA laporan (termasuk baru) di checkpoint yang pernah dihapus admin, selamanya.
  assert.doesNotMatch(
    fnSlice,
    /if \(!tombstoneShiftKey \|\|/,
    'tombstone tanpa shift_key TIDAK boleh me-reset laporan tanpa cek waktu (membuang laporan baru)',
  );
  // Reset tanpa-syarat HANYA boleh saat shift_key cocok persis.
  assert.match(
    fnSlice,
    /if \(tombstoneShiftKey && checkpointShiftKey === tombstoneShiftKey\) return true;/,
    'reset langsung hanya untuk shift_key yang sama persis',
  );
  // Selain itu wajib lewat guard waktu yang sudah ada.
  assert.match(
    runtimeSource,
    /checkpointAtMs <= deletedAtMs/,
    'kasus natural/beda-shift wajib lewat guard waktu checkpointAtMs <= deletedAtMs',
  );
});
