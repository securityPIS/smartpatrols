/*
Tujuan: Mengunci normalisasi can_access_ship_name() di RLS Supabase. Bug: perbandingan exact
        '=' antara current_profile_ship() (profiles.ship_assigned) dan ships.name membuat selisih
        sepele (spasi/kapital/rename) menyembunyikan SELURUH baris kapal dari petugas → daftar
        checkpoint kosong. Migrasi 20260625000000 menormalkan kedua sisi (lower + collapse
        whitespace via regexp_replace + btrim), cermin createShipNameKey() di klien.
Caller: Node test runner (npm run test:security).
Dependensi: supabase/migrations/20260625000000_normalize_can_access_ship_name.sql (read-only).
Side Effects: Tidak ada.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../../supabase/migrations/20260625000000_normalize_can_access_ship_name.sql', import.meta.url),
  'utf8',
);

test('migrasi mendefinisikan ulang can_access_ship_name sebagai security definer', () => {
  assert.match(sql, /create or replace function public\.can_access_ship_name\(target_ship_name text\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = public/);
  assert.match(sql, /grant execute on function public\.can_access_ship_name\(text\) to authenticated;/);
});

test('perbandingan nama kapal dinormalkan (lower + collapse whitespace + btrim) di kedua sisi', () => {
  assert.ok(sql.includes('lower('), 'harus lowercase nama kapal');
  assert.ok(sql.includes('regexp_replace('), 'harus collapse whitespace via regexp_replace');
  assert.ok(sql.includes("'\\s+'"), 'regexp_replace harus menyasar whitespace berulang');
  assert.ok(sql.includes('btrim('), 'harus trim spasi tepi');
  // Dinormalkan untuk current_profile_ship() DAN target_ship_name (dua pemanggilan masing-masing).
  const lowerCount = (sql.match(/lower\(coalesce\(/g) || []).length;
  assert.ok(lowerCount >= 2, `kedua sisi nama harus dinormalkan, ditemukan ${lowerCount}`);
});

test('akses ADMIN tetap bypass dan hanya PIC/PETUGAS yang dicek kapal', () => {
  assert.match(sql, /public\.current_profile_role\(\) = 'ADMIN'/);
  assert.match(sql, /public\.current_profile_role\(\) in \('PIC', 'PETUGAS'\)/);
});

test('tidak ada lagi perbandingan exact equal mentah ship_assigned = ship name', () => {
  // Pola lama: "public.current_profile_ship() = target_ship_name" tanpa normalisasi.
  assert.doesNotMatch(
    sql,
    /current_profile_ship\(\)\s*=\s*target_ship_name/,
    'perbandingan exact mentah harus diganti versi ternormalisasi',
  );
});
