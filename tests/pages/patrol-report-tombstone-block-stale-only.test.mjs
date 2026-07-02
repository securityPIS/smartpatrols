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
const narrowMigrationSource = readFileSync(
  new URL('../../supabase/migrations/20260702000000_narrow_admin_delete_patrol_findings.sql', import.meta.url),
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

test('guard klien tombstone hanya reset temuan BASI, termasuk saat shift_key sama persis', () => {
  const startIndex = runtimeSource.indexOf('function shouldApplyPatrolReportTombstoneToCheckpoint');
  assert.notEqual(startIndex, -1, 'fungsi guard tombstone klien harus ada');
  const fnSlice = runtimeSource.slice(startIndex, startIndex + 1600);

  // Bug lama A: `if (!tombstoneShiftKey || ...) return true;` -> tombstone natural shift_key=NULL
  // me-reset SEMUA laporan (termasuk baru) di checkpoint yang pernah dihapus admin, selamanya.
  assert.doesNotMatch(
    fnSlice,
    /if \(!tombstoneShiftKey \|\|/,
    'tombstone tanpa shift_key TIDAK boleh me-reset laporan tanpa cek waktu (membuang laporan baru)',
  );
  // Bug lama B (akar "laporan JKT03 shift 2 hilang"): shift_key sama persis -> reset TANPA
  // SYARAT. Cabang ini membuang laporan baru/aman di shift yang sama -> harus dihapus.
  assert.doesNotMatch(
    fnSlice,
    /if \(tombstoneShiftKey && checkpointShiftKey === tombstoneShiftKey\) return true;/,
    'reset tanpa syarat untuk shift_key sama membuang laporan baru/aman -> harus dihapus',
  );
  // Laporan AMAN tidak pernah direset oleh penghapusan temuan.
  assert.match(
    fnSlice,
    /if \(checkpoint\?\.resultType !== 'temuan'\) return false;/,
    'hanya laporan temuan yang boleh direset tombstone (laporan aman tidak boleh hilang)',
  );
  // Guard waktu wajib untuk SEMUA kasus (termasuk shift sama): hanya laporan basi yang direset.
  assert.match(
    fnSlice,
    /checkpointAtMs <= deletedAtMs/,
    'reset wajib lewat guard waktu checkpointAtMs <= deletedAtMs untuk semua kasus',
  );
});

test('reset tombstone memakai deleted_at sebagai timestamp, bukan waktu sekarang', () => {
  const startIndex = runtimeSource.indexOf('const applyPatrolReportTombstones = useCallback');
  assert.notEqual(startIndex, -1, 'applyPatrolReportTombstones harus ada');
  const fnSlice = runtimeSource.slice(startIndex, startIndex + 2600);

  // Reset harus memakai tombstone.deletedAt agar laporan baru (completedAt > deletedAt) menang
  // merge dan poll tombstone berkala tidak "meremajakan" reset menutupi submit ulang yang sah.
  assert.match(
    fnSlice,
    /updatedAt: tombstone\?\.deletedAt \|\| getTrustedDate\(\)\.toISOString\(\)/,
    'reset tombstone wajib memakai deleted_at sebagai updatedAt (bukan sekarang)',
  );
});

test('RPC hapus temuan tidak menghapus baris AMAN atau baris shift lain', () => {
  assert.match(
    narrowMigrationSource,
    /create or replace function public\.admin_delete_patrol_report_findings/,
    'migrasi harus meredefinisi RPC hapus temuan',
  );
  // MODE B (fallback tanpa uuid) WAJIB difilter result_type='temuan' agar AMAN tidak ikut hilang.
  assert.match(
    narrowMigrationSource,
    /result_type = 'temuan'/,
    'penghapusan via natural key wajib difilter result_type=temuan agar laporan AMAN tidak terhapus',
  );
  // MODE A presisi: bila uuid ada, jalur natural key dimatikan (v_firestore_uuid is null) supaya
  // penghapusan satu temuan tidak menyapu baris shift lain pada checkpoint yang sama.
  assert.match(
    narrowMigrationSource,
    /v_firestore_uuid is null/,
    'jalur natural key hanya fallback saat uuid tidak ada (hindari hapus lintas shift)',
  );
});
