/*
Tujuan: Mencegah regresi delta subscription incidents agar update realtime tidak selalu
        melakukan full fetch list insiden.
Caller: Node test runner saat verifikasi listener incident.
Dependensi: src/services/backend/incidentReports.js.
Main Functions: Mengunci cache lokal, merge by id, delete by id, sort desc, dan limit list.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../src/services/backend/incidentReports.js', import.meta.url),
  'utf8',
);

function extractSubscribeFunction() {
  const startIndex = source.indexOf('export function subscribeToIncidents');
  assert.notEqual(startIndex, -1, 'subscribeToIncidents harus ada');
  const endIndex = source.indexOf('export async function saveIncidentReport', startIndex);
  assert.notEqual(endIndex, -1, 'saveIncidentReport harus muncul setelah subscription');
  return source.slice(startIndex, endIndex);
}

test('subscription incidents menyimpan cache lokal dan emit dari cache', () => {
  const fn = extractSubscribeFunction();
  assert.match(fn, /let currentRows = \[\]/);
  assert.match(fn, /currentRows = data \|\| \[\]/);
  assert.match(fn, /callback\(sortedRows\.map\(mapRowToIncident\)\)/);
});

test('incident emit tetap sort descending dan dibatasi listen limit', () => {
  const fn = extractSubscribeFunction();
  assert.match(fn, /\.sort\(\(left, right\) => new Date\(right\.created_at \|\| 0\) - new Date\(left\.created_at \|\| 0\)\)/);
  assert.match(fn, /\.slice\(0, INCIDENTS_LISTEN_LIMIT\)/);
});

test('delta incidents fallback fetch bila event tidak punya id', () => {
  const fn = extractSubscribeFunction();
  assert.match(fn, /const nextRow = event\.new \|\| null/);
  assert.match(fn, /const oldRow = event\.old \|\| null/);
  assert.match(fn, /if \(!rowId\) \{[\s\S]*?fetchRows\(\)\.catch\(onError\)/);
});

test('delete incidents menghapus dari cache by id', () => {
  const fn = extractSubscribeFunction();
  assert.match(fn, /if \(event\.eventType === 'DELETE'\) \{[\s\S]*?currentRows = currentRows\.filter\(row => row\.id !== rowId\)/);
});

test('insert update incidents merge by id tanpa fetchRows rutin', () => {
  const fn = extractSubscribeFunction();
  assert.match(fn, /const index = currentRows\.findIndex\(row => row\.id === rowId\)/);
  assert.match(fn, /currentRows = \[[\s\S]*?\.\.\.currentRows\.slice\(0, index\)[\s\S]*?nextRow[\s\S]*?\.\.\.currentRows\.slice\(index \+ 1\)/);
  assert.match(fn, /currentRows = \[nextRow, \.\.\.currentRows\]/);
});
