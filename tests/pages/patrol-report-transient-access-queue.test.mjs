/*
Tujuan: Mengunci regresi agar submit patroli tidak hilang saat akses cloud transient.
Caller: Node test runner untuk verifikasi flow submit patrol_reports.
Dependensi: AppContextRuntime dan adapter patrolReports.
Main Functions: Memastikan status no-access transient masuk outbox retry, bukan berhenti lokal.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtimeSource = readFileSync(
  new URL('../../src/context/AppContextRuntime.jsx', import.meta.url),
  'utf8',
);
const patrolReportsSource = readFileSync(
  new URL('../../src/services/backend/patrolReports.js', import.meta.url),
  'utf8',
);

test('submit patrol saat akses cloud transient tetap antre ke patrol_report outbox', () => {
  assert.match(
    runtimeSource,
    /queuePatrolReportForRetry/,
    'runtime harus memakai queuePatrolReportForRetry saat akses cloud belum siap',
  );

  const startIndex = runtimeSource.indexOf('const syncPatrolReportToDomain = useCallback');
  assert.notEqual(startIndex, -1, 'syncPatrolReportToDomain harus ada');
  const fnSlice = runtimeSource.slice(startIndex, startIndex + 5200);

  assert.match(
    fnSlice,
    /if \(!hasOperationalCloudAccess\) \{/,
    'branch hasOperationalCloudAccess=false harus ditangani eksplisit',
  );
  assert.match(
    fnSlice,
    /canQueueForAccessRecovery/,
    'runtime harus membedakan akses definitif ditolak vs transient',
  );
  assert.match(
    fnSlice,
    /await queuePatrolReportForRetry\(pendingReport,[\s\S]*reason: 'cloud-access-pending'/,
    'akses cloud transient wajib queue pendingReport ke outbox, bukan berhenti lokal saja',
  );
  assert.doesNotMatch(
    fnSlice,
    /if \(!hasOperationalCloudAccess\) \{\s*const status = \{ syncStatus: 'no-access' \};[\s\S]{0,180}return status;\s*\}/,
    'bug lama: no-access langsung return sebelum laporan masuk outbox',
  );
});

test('adapter patrolReports menyediakan queue retry eksplisit dengan clientUpdatedAt stabil', () => {
  assert.match(
    patrolReportsSource,
    /export async function queuePatrolReportForRetry/,
    'adapter harus mengekspos queue retry eksplisit',
  );
  assert.match(
    patrolReportsSource,
    /type: 'patrol_report\.upsert'/,
    'queue retry harus memakai handler outbox patrol_report.upsert',
  );
  assert.match(
    patrolReportsSource,
    /queuedForRetry: true/,
    'hasil queue harus bisa dipetakan ke status UI khusus',
  );
  assert.match(
    patrolReportsSource,
    /Number\(report\.clientUpdatedAt\)/,
    'flush outbox harus mempertahankan clientUpdatedAt dari payload antrean',
  );
});

test('UI membedakan laporan diantrekan dari offline atau server blocked', () => {
  assert.match(
    runtimeSource,
    /syncStatus: 'queued'/,
    'toPatrolSyncStatus harus mengembalikan status queued untuk retry transient',
  );
  assert.match(
    runtimeSource,
    /Laporan masuk antrean sinkronisasi/,
    'petugas harus mendapat feedback bahwa laporan masuk antrean kirim ulang',
  );
});
