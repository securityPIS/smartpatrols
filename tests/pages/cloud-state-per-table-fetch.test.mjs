/*
Tujuan: Mencegah regresi optimasi egress DB Supabase agar realtime tabel spesifik tidak
        kembali memicu hydrate penuh 6 tabel untuk semua event.
Caller: Node test runner saat verifikasi source sync cloud.
Dependensi: src/services/backend/cloudState.js.
Main Functions: Mengunci raw-row cache per tabel, signal domain-aware tanpa full hydrate,
        watermark recovery, dan pemisahan domain inti/sekunder.
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
  assert.match(source, /async function fetchProfilesRows\(supabase\)[\s\S]*?\.from\('profiles'\)\.select\(PROFILE_COLUMNS\)[\s\S]*?\.limit\(500\)/);
  assert.match(source, /async function fetchShipsRows\(supabase\)[\s\S]*?\.from\('ships'\)\.select\(SHIP_COLUMNS\)[\s\S]*?\.limit\(200\)/);
  assert.match(source, /async function fetchPatrolReportRows\(supabase, options = \{\}\)[\s\S]*?\.from\('patrol_reports'\)\.select\(PATROL_REPORT_COLUMNS\)[\s\S]*?\.limit\(500\)/);
});

test('domain armada tetap critical dan domain laporan/sekunder fallback kosong', () => {
  assert.match(source, /fetchProfilesRows\(supabase\)[\s\S]*?\{ critical: true \}/);
  assert.match(source, /fetchShipsRows\(supabase\)[\s\S]*?\{ critical: true \}/);
  assert.doesNotMatch(source, /fetchPatrolReportRows\(supabase(?:, options)?\)[\s\S]*?\{ critical: true \}/);
  assert.match(source, /console\.error\(`Gagal memuat domain '\$\{label\}'/);
});

test('fetch patrol_reports bisa dipersempit ke shift dan kapal agar RLS tidak timeout', () => {
  assert.match(source, /async function fetchPatrolReportRows\(supabase, options = \{\}\)/);
  assert.match(source, /if \(options\.shiftKey\) query = query\.eq\('shift_key', options\.shiftKey\)/);
  assert.match(source, /if \(options\.shipId\) query = query\.eq\('ship_id', options\.shipId\)/);
  assert.match(source, /if \(options\.shipName\) query = query\.eq\('ship_name', options\.shipName\)/);
  assert.match(source, /fetchPatrolReportRows\(supabase, options\)/);
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

test('client_mutations domain-aware dan tidak full hydrate default', () => {
  const fn = extractActiveSubscribeFunction();
  assert.match(fn, /table: 'client_mutations' \}, \(event\) => \{[\s\S]*?resolveSignalTables\(event\?\.new \|\| \{\}\)/);
  assert.match(fn, /tables\.forEach\(\(table\) => scheduleFetch\(table\)\)/);
  assert.match(fn, /scheduleSignalRecovery\(\)/);
  assert.doesNotMatch(fn, /scheduleFetch\(null, \{ full: true \}\)/);
  assert.doesNotMatch(fn, /table: 'pending_registrations'/);
});

test('watermark RPC tersedia sebagai recovery ringan', () => {
  assert.match(source, /export async function fetchCloudSyncWatermarks\(options = \{\}\)/);
  assert.match(source, /supabase\.rpc\('get_operational_sync_watermarks'/);
  assert.match(source, /fetchLatestUpdatedAt\(supabase, 'patrol_reports', 'updated_at', options\)/);
});

test('fetch realtime memakai debounce dan penjaga in-flight agar tidak paralel liar', () => {
  const fn = extractActiveSubscribeFunction();
  assert.match(fn, /let fetchInFlight = false/);
  assert.match(fn, /const queuedTables = new Set\(\)/);
  assert.match(fn, /setTimeout\(\(\) => \{[\s\S]*?flushQueuedFetch\(\)\.catch\(onError\)/);
  assert.match(fn, /if \(fetchInFlight \|\| disposed\) return/);
});

test('refresh server wajib tidak fallback diam-diam ke cache cloud lama', () => {
  assert.match(source, /function shouldUseCloudStateCacheFallback\(options = \{\}\)/);
  assert.match(source, /if \(options\.allowCacheFallback === false\) return false/);
  assert.match(source, /if \(options\.preferServer === true\) return false/);
  assert.match(source, /export async function fetchCloudAppState\(options = \{\}\)/);
  assert.match(source, /if \(!shouldUseCloudStateCacheFallback\(options\)\) \{[\s\S]*?throw error;[\s\S]*?\}/);
});

test('hydrate awal realtime tidak emit cache lama saat browser jelas online', () => {
  const fn = extractActiveSubscribeFunction();
  assert.match(fn, /export function subscribeToCloudAppState\(callback, onError, options = \{\}\)/);
  assert.match(source, /function isBrowserDefinitelyOnline\(\)[\s\S]*?navigator\.onLine === true/);
  assert.match(fn, /const cached = isBrowserDefinitelyOnline\(\)[\s\S]*?\? null[\s\S]*?: await loadCacheSnapshot\('cloud-state'\)/);
});

test('gagal menyimpan cache cloud tidak membatalkan payload server valid', () => {
  const fn = extractActiveSubscribeFunction();
  assert.match(source, /async function saveCloudStateCacheSnapshot\(payload\)[\s\S]*?try \{[\s\S]*?await saveCacheSnapshot\('cloud-state', payload\)[\s\S]*?catch \(error\) \{[\s\S]*?lanjut memakai state server/);
  assert.match(fn, /await saveCloudStateCacheSnapshot\(payload\);[\s\S]*?if \(!disposed\) callback\(payload\)/);
  assert.match(source, /const payload = await hydrateStateFromSql\(options\);[\s\S]*?await saveCloudStateCacheSnapshot\(payload\);[\s\S]*?return payload;/);
  assert.equal((source.match(/await saveCacheSnapshot\('cloud-state', payload\);/g) || []).length, 1);
});
