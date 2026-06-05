/*
Tujuan: Mencegah regresi optimasi egress DB Supabase agar realtime tabel spesifik tidak
        kembali memicu hydrate penuh 6 tabel untuk semua event.
Caller: Node test runner saat verifikasi source sync cloud.
Dependensi: src/services/backend/cloudState.js.
Main Functions: Mengunci raw-row cache per tabel, full hydrate untuk signal generik,
        dan pemisahan domain inti/sekunder.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../src/services/backend/cloudState.js', import.meta.url),
  'utf8',
);

function extractActiveSubscribeFunction() {
  const startIndex = source.indexOf('export function subscribeToCloudAppState');
  assert.notEqual(startIndex, -1, 'subscribeToCloudAppState aktif harus diekspor');
  const legacyIndex = source.indexOf('async function hydrateStateFromSqlLegacy', startIndex);
  const signalIndex = source.indexOf('export function subscribeToCloudSyncSignal', startIndex);
  const endIndex = legacyIndex !== -1 ? legacyIndex : signalIndex;
  assert.notEqual(endIndex, -1, 'batas akhir subscribe state aktif harus ditemukan');
  return source.slice(startIndex, endIndex);
}

test('hydrate cloud memakai helper fetch per tabel dengan limit profiles dan ships', () => {
  assert.match(source, /async function fetchProfilesRows\(supabase\)[\s\S]*?\.from\('profiles'\)[\s\S]*?\.limit\(500\)/);
  assert.match(source, /async function fetchShipsRows\(supabase\)[\s\S]*?\.from\('ships'\)[\s\S]*?\.limit\(200\)/);
  assert.match(source, /async function fetchPatrolReportRows\(supabase\)[\s\S]*?\.from\('patrol_reports'\)[\s\S]*?\.limit\(500\)/);
});

test('domain inti tetap critical dan domain sekunder fallback kosong', () => {
  assert.match(source, /fetchProfilesRows\(supabase\)[\s\S]*?\{ critical: true \}/);
  assert.match(source, /fetchShipsRows\(supabase\)[\s\S]*?\{ critical: true \}/);
  assert.match(source, /fetchPatrolReportRows\(supabase\)[\s\S]*?\{ critical: true \}/);
  assert.match(source, /console\.error\(`Gagal memuat domain '\$\{label\}'/);
});

test('subscribe cloud state menyimpan raw rows di closure dan emit payload dari cache', () => {
  const fn = extractActiveSubscribeFunction();
  assert.match(fn, /const cachedRows = \{[\s\S]*?patrol_reports: \[\][\s\S]*?notifications: \[\]/);
  assert.match(fn, /buildStatePayload\([\s\S]*?cachedRows\.profiles[\s\S]*?cachedRows\.patrol_reports[\s\S]*?cachedRows\.notifications/);
  assert.doesNotMatch(fn, /_profileRows|_shipRows|_reportRows/, 'raw rows tidak boleh dibocorkan ke payload state');
});

test('event tabel spesifik hanya menjadwalkan fetch tabel terkait', () => {
  const fn = extractActiveSubscribeFunction();
  assert.match(fn, /table: 'patrol_reports' \}, \(\) => \{[\s\S]*?scheduleFetch\('patrol_reports'\)/);
  assert.match(fn, /table: 'incidents' \}, \(\) => \{[\s\S]*?scheduleFetch\('incidents'\)/);
  assert.match(fn, /table: 'notifications' \}, \(\) => \{[\s\S]*?scheduleFetch\('notifications'\)/);
});

test('client_mutations tetap full hydrate dan pending_registrations tidak ada di channel global', () => {
  const fn = extractActiveSubscribeFunction();
  assert.match(fn, /table: 'client_mutations' \}, \(\) => \{[\s\S]*?scheduleFetch\(null, \{ full: true \}\)/);
  assert.doesNotMatch(fn, /table: 'pending_registrations'/);
});

test('fetch realtime memakai debounce dan penjaga in-flight agar tidak paralel liar', () => {
  const fn = extractActiveSubscribeFunction();
  assert.match(fn, /let fetchInFlight = false/);
  assert.match(fn, /const queuedTables = new Set\(\)/);
  assert.match(fn, /setTimeout\(\(\) => \{[\s\S]*?flushQueuedFetch\(\)\.catch\(onError\)/);
  assert.match(fn, /if \(fetchInFlight \|\| disposed\) return/);
});
