/*
Tujuan: Mencegah history shift tetap missed saat laporan patrol_reports masuk terlambat.
Caller: Node test runner saat verifikasi finalisasi shift server-side.
Dependensi: migration refresh_shift_history_on_late_patrol_report.
Main Functions: Memastikan finalize_shift bisa update entry existing dan trigger late report aktif.
Side Effects: Tidak ada; test membaca file migration secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationSource = readFileSync(
  new URL('../../supabase/migrations/20260704114027_refresh_shift_history_on_late_patrol_report.sql', import.meta.url),
  'utf8',
);

test('finalize_shift bisa rebuild shift_history_entries existing', () => {
  assert.match(
    migrationSource,
    /create or replace function public\.finalize_shift_for_ship/,
    'migration harus menyediakan helper rebuild per kapal',
  );
  assert.match(
    migrationSource,
    /on conflict \(shift_key, ship_id\) do update[\s\S]*?aman_count = excluded\.aman_count[\s\S]*?missed_count = excluded\.missed_count[\s\S]*?checkpoints = excluded\.checkpoints/,
    'history existing wajib di-update, bukan do nothing, agar late patrol mengoreksi missed',
  );
  assert.match(
    migrationSource,
    /create or replace function public\.finalize_shift\(p_shift_id text, p_date_key text\)[\s\S]*?return public\.finalize_shift_for_ship\(p_shift_id, p_date_key, null\)/,
    'wrapper finalize_shift yang dipakai pg_cron tetap tersedia',
  );
});

test('patrol_reports late insert/update memicu rebuild history setelah shift berakhir', () => {
  assert.match(
    migrationSource,
    /create or replace function public\.refresh_shift_history_after_late_patrol_report/,
    'trigger function late report harus ada',
  );
  assert.match(
    migrationSource,
    /when 'shift-2-active' then \(v_date_key::date \+ time '18:00'\)/,
    'shift 2 hanya direbuild otomatis setelah 18:00 WIB',
  );
  assert.match(
    migrationSource,
    /if v_shift_end_wib is null or v_now_wib < v_shift_end_wib then[\s\S]*?return new;/,
    'trigger tidak boleh membuat history sebelum shift selesai',
  );
  assert.match(
    migrationSource,
    /create trigger refresh_shift_history_after_late_patrol_report_trg[\s\S]*?after insert or update on public\.patrol_reports[\s\S]*?when \(new\.status = 'completed'\)/,
    'hanya row completed yang memicu rebuild late history',
  );
});

test('helper SECURITY DEFINER late history tidak dibuka ke public', () => {
  assert.match(
    migrationSource,
    /security definer[\s\S]*?set search_path = public/,
    'fungsi security definer harus punya search_path eksplisit',
  );
  assert.match(
    migrationSource,
    /revoke all on function public\.finalize_shift_for_ship\(text, text, text\) from public;/,
    'helper internal tidak boleh executable oleh PUBLIC',
  );
  assert.match(
    migrationSource,
    /revoke all on function public\.refresh_shift_history_after_late_patrol_report\(\) from public;/,
    'trigger function internal tidak boleh executable oleh PUBLIC',
  );
});
