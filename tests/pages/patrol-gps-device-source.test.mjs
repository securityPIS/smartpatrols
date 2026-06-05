/*
Tujuan: Mencegah regresi GPS patroli agar laporan tidak memakai koordinat dummy/fallback kapal.
Caller: Node test runner saat verifikasi submit laporan patroli.
Dependensi: src/context/AppContextRuntime.jsx dan HistoryDetailView.
Main Functions: Mengunci GPS device-only, submit guard saat GPS tidak tersedia, dan map tanpa fallback hardcoded.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtimeSource = readFileSync(
  new URL('../../src/context/AppContextRuntime.jsx', import.meta.url),
  'utf8',
);
const historyDetailSource = readFileSync(
  new URL('../../src/components/views/HistoryDetailView.jsx', import.meta.url),
  'utf8',
);

function extractRuntimeSlice(startNeedle, endNeedle) {
  const startIndex = runtimeSource.indexOf(startNeedle);
  assert.notEqual(startIndex, -1, `${startNeedle} harus ada`);
  const endIndex = runtimeSource.indexOf(endNeedle, startIndex);
  assert.notEqual(endIndex, -1, `${endNeedle} harus muncul setelah ${startNeedle}`);
  return runtimeSource.slice(startIndex, endIndex);
}

test('submit patroli meminta GPS fresh dan device-only', () => {
  assert.match(runtimeSource, /const PATROL_SUBMIT_GEOLOCATION_TIMEOUT_MS = 12000/);
  assert.match(runtimeSource, /const PATROL_SUBMIT_GEOLOCATION_MAX_AGE_MS = 0/);
  assert.match(
    runtimeSource,
    /function createDeviceGeolocationSnapshot\(coords, provider\)[\s\S]*?source: 'device'[\s\S]*?provider/,
    'snapshot GPS harus berasal dari perangkat dan mencatat provider',
  );
});

test('capturePatrolEnvironmentSnapshot tidak mengisi gpsSnapshot dari shipSnapshot', () => {
  const fn = extractRuntimeSlice(
    'async function capturePatrolEnvironmentSnapshot',
    'function sortHistoryEntries',
  );

  assert.match(
    fn,
    /const gpsSnapshot = deviceLocation[\s\S]*?\? \{[\s\S]*?\.\.\.deviceLocation[\s\S]*?capturedAt[\s\S]*?\}[\s\S]*?: null;/,
    'gpsSnapshot harus null bila GPS perangkat tidak tersedia',
  );
  assert.doesNotMatch(fn, /source:\s*'ship'/);
  assert.doesNotMatch(fn, /gpsSnapshot[\s\S]*?shipSnapshot\?\.lat/);
});

test('handleSubmitPatrol menolak simpan laporan tanpa GPS perangkat', () => {
  const fn = extractRuntimeSlice(
    'const handleSubmitPatrol = useCallback',
    'const handleDeleteReport = useCallback',
  );

  assert.match(fn, /if \(!environmentSnapshot\.gpsSnapshot\) \{/);
  assert.match(fn, /Laporan belum disimpan supaya koordinat patroli tidak tercatat sebagai dummy atau fallback kapal/);
});

test('payload cloud GPS menolak koordinat parsial dan mempertahankan metadata perangkat', () => {
  const fn = extractRuntimeSlice(
    'function compactGpsSnapshotForCloudSync',
    'function compactWeatherSnapshotForCloudSync',
  );

  assert.match(fn, /if \(lat == null \|\| lng == null\) return null/);
  assert.match(fn, /accuracy/);
  assert.match(fn, /provider/);
  assert.match(fn, /capturedAt/);
});

test('history detail tidak menampilkan map koordinat default saat GPS kosong', () => {
  assert.doesNotMatch(historyDetailSource, /-6\.1021/);
  assert.doesNotMatch(historyDetailSource, /106\.8833/);
  assert.match(historyDetailSource, /GPS perangkat belum tersedia/);
  assert.match(historyDetailSource, /displayMapLocation = latestCompletedCheckpoint\?\.gpsSnapshot \|\| null/);
});
