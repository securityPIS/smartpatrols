/*
Tujuan: Mencegah regresi penerima Shift Wrap-Up kembali hanya ADMIN/PIC.
Caller: Node test runner saat verifikasi migration notifikasi cron.
Dependensi: supabase/migrations/20260612042244_include_petugas_shift_wrapup_recipients.sql.
Main Functions: Memastikan notify_shift_wrapup menarget PIC + PETUGAS aktif sekapal.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../supabase/migrations/20260612042244_include_petugas_shift_wrapup_recipients.sql', import.meta.url),
  'utf8',
);

test('shift wrap-up per-kapal menarget PIC dan PETUGAS aktif sekapal', () => {
  assert.match(
    source,
    /create or replace function public\.notify_shift_wrapup\(p_shift_id text, p_date_key text\)/,
    'migration harus me-replace notify_shift_wrapup',
  );
  assert.match(
    source,
    /p\.ship_assigned = v_ship\.name[\s\S]*?p\.role = 'PIC'[\s\S]*?or \(p\.role = 'PETUGAS' and p\.status = 'active'\)/,
    'penerima per-kapal harus mencakup PIC dan PETUGAS aktif kapal yang sama',
  );
});

test('shift wrap-up tetap memakai custom_checkpoints dan trigger notification fan-out', () => {
  assert.match(
    source,
    /jsonb_typeof\(s\.custom_checkpoints\) = 'array'[\s\S]*?jsonb_array_length\(s\.custom_checkpoints\) > 0/,
    'iterasi kapal harus tetap berbasis ships.custom_checkpoints',
  );
  assert.match(
    source,
    /public\.insert_notification_fanout\([\s\S]*?p_type\s*=>\s*'shift_wrap_up'/,
    'hasil wrap-up harus tetap masuk tabel notifications agar trigger push berjalan',
  );
  assert.doesNotMatch(
    source,
    /from\s+public\.ship_checkpoints/i,
    'fungsi wrap-up tidak boleh kembali membaca tabel ship_checkpoints',
  );
});

test('security definer notify_shift_wrapup memakai search_path eksplisit', () => {
  assert.match(
    source,
    /security definer\s+set search_path = public, pg_temp/i,
    'fungsi security definer harus mengunci search_path',
  );
});
