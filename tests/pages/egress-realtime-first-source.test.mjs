/*
Tujuan: Mengunci strategi egress realtime-first agar update instan tidak kembali menjadi full snapshot periodik.
Caller: Node test runner saat verifikasi optimasi egress.
Dependensi: AppContextRuntime, cloudState, adapter domain, dan migration egress realtime-first.
Main Functions: Memastikan signal domain-aware, watchdog watermark, projection eksplisit, dan migration aman.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtimeSource = readFileSync(
  new URL('../../src/context/AppContextRuntime.jsx', import.meta.url),
  'utf8',
);
const cloudStateSource = readFileSync(
  new URL('../../src/services/backend/cloudState.js', import.meta.url),
  'utf8',
);
const patrolReportsSource = readFileSync(
  new URL('../../src/services/backend/patrolReports.js', import.meta.url),
  'utf8',
);
const incidentReportsSource = readFileSync(
  new URL('../../src/services/backend/incidentReports.js', import.meta.url),
  'utf8',
);
const migrationSource = readFileSync(
  new URL('../../supabase/migrations/20260607014119_egress_realtime_first_delta_sync.sql', import.meta.url),
  'utf8',
);

test('runtime memakai watermark watchdog, bukan full snapshot 8 detik', () => {
  assert.match(runtimeSource, /fetchCloudSyncWatermarks/);
  assert.match(runtimeSource, /const WATERMARK_CHECK_INTERVAL_MS = 60000/);
  assert.match(runtimeSource, /void runWatermarkCheck\('interval'\)/);
  assert.doesNotMatch(runtimeSource, /runRefresh\('interval'[\s\S]*?\}, 8000\)/);
  assert.doesNotMatch(runtimeSource, /const refreshIntervalId = typeof window/);
});

test('signal domain tidak selalu memaksa snapshot penuh', () => {
  assert.match(runtimeSource, /function shouldRefreshSharedStateForSignal\(signal = \{\}\)/);
  assert.match(runtimeSource, /signal-domain-skip-full-refresh/);
  assert.match(runtimeSource, /if \(attempt >= 1\) return/);
  assert.doesNotMatch(runtimeSource, /if \(attempt >= 5\) return/);
});

test('fetch utama memakai projection eksplisit, bukan select bintang', () => {
  assert.match(cloudStateSource, /select\(PROFILE_COLUMNS\)/);
  assert.match(cloudStateSource, /select\(SHIP_COLUMNS\)/);
  assert.match(cloudStateSource, /select\(PATROL_REPORT_COLUMNS\)/);
  assert.match(patrolReportsSource, /select\(PATROL_REPORT_COLUMNS\)/);
  assert.match(incidentReportsSource, /select\(INCIDENT_COLUMNS\)/);
  assert.doesNotMatch(cloudStateSource, /\.select\('\*'\)/);
  assert.doesNotMatch(patrolReportsSource, /\.select\('\*'\)/);
  assert.doesNotMatch(incidentReportsSource, /\.select\('\*'\)/);
});

test('migration menambah watermark dan replica identity hanya untuk tabel aman', () => {
  assert.match(migrationSource, /create or replace function public\.get_operational_sync_watermarks/);
  assert.match(migrationSource, /security invoker/);
  assert.match(migrationSource, /patrol_reports_shift_ship_updated_idx/);
  assert.match(migrationSource, /alter table public\.client_mutations replica identity default/);
  assert.match(migrationSource, /alter table public\.notifications replica identity default/);
  assert.match(migrationSource, /alter table public\.sos_alerts replica identity default/);
  assert.match(migrationSource, /alter table public\.incidents replica identity default/);
  assert.doesNotMatch(migrationSource, /alter table public\.patrol_reports replica identity default/);
  assert.doesNotMatch(migrationSource, /alter table public\.profiles replica identity default/);
  assert.doesNotMatch(migrationSource, /alter table public\.ships replica identity default/);
});
