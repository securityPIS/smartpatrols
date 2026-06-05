/*
Tujuan: Mencegah regresi delta subscription patrol_reports agar egress turun tanpa
        mencampur data kapal lain pada shift yang sama.
Caller: Node test runner saat verifikasi listener laporan patroli.
Dependensi: src/services/backend/patrolReports.js.
Main Functions: Mengunci cache baris lokal, guard shift/kapal, fallback saat event tidak lengkap,
        dan polling tombstone 30 detik.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../src/services/backend/patrolReports.js', import.meta.url),
  'utf8',
);

function extractSubscribeFunction() {
  const startIndex = source.indexOf('export function subscribeToPatrolReports');
  assert.notEqual(startIndex, -1, 'subscribeToPatrolReports harus ada');
  const endIndex = source.indexOf('export async function savePatrolReport', startIndex);
  assert.notEqual(endIndex, -1, 'savePatrolReport harus muncul setelah subscription');
  return source.slice(startIndex, endIndex);
}

test('subscription patrol menyimpan cache lokal dan emit dari cache', () => {
  const fn = extractSubscribeFunction();
  assert.match(fn, /let currentRows = \[\]/);
  assert.match(fn, /const emitCurrent = \(\) => \{[\s\S]*?callback\(currentRows\.map\(mapRowToReport\)\)/);
  assert.match(fn, /currentRows = data \|\| \[\]/);
});

test('event realtime patrol tetap dijaga shift, ship_id, dan ship_name', () => {
  const fn = extractSubscribeFunction();
  assert.match(fn, /const rowBelongsToSubscription = \(row = \{\}\) => \{/);
  assert.match(fn, /String\(row\.shift_key \|\| ''\) !== String\(shiftKey \|\| ''\)/);
  assert.match(fn, /String\(row\.ship_id \|\| ''\) !== String\(shipId \|\| ''\)/);
  assert.match(fn, /shipName && String\(row\.ship_name \|\| ''\) !== String\(shipName\)/);
});

test('delta patrol merge memakai event.new/event.old dan fallback bila id tidak ada', () => {
  const fn = extractSubscribeFunction();
  assert.match(fn, /const nextRow = event\.new \|\| null/);
  assert.match(fn, /const oldRow = event\.old \|\| null/);
  assert.match(fn, /if \(!rowId\) \{[\s\S]*?fetchRows\(\)\.catch\(onError\)/);
});

test('delete patrol hanya menghapus row yang cocok subscription', () => {
  const fn = extractSubscribeFunction();
  assert.match(fn, /if \(event\.eventType === 'DELETE'\) \{[\s\S]*?if \(!rowBelongsToSubscription\(oldRow\)\) return/);
  assert.match(fn, /currentRows = currentRows\.filter\(row => row\.id !== rowId\)/);
});

test('insert update kapal lain menghapus cache lama bila row keluar subscription', () => {
  const fn = extractSubscribeFunction();
  assert.match(fn, /if \(!rowBelongsToSubscription\(nextRow\)\) \{[\s\S]*?currentRows = currentRows\.filter\(row => row\.id !== rowId\)/);
});

test('cache penuh fallback fetch agar batas listen tetap benar', () => {
  const fn = extractSubscribeFunction();
  assert.match(fn, /currentRows\.length < PATROL_REPORTS_LISTEN_LIMIT/);
  assert.match(fn, /else \{[\s\S]*?fetchRows\(\)\.catch\(onError\)/);
});

test('polling tombstone fallback dikurangi ke 30 detik', () => {
  assert.match(source, /const POLL_INTERVAL_MS = 30000/);
});
