/*
Tujuan: Mencegah regresi bug "laporan offline tak muncul di device lain" — submit patroli saat
        offline HARUS tetap diproses agar diantrekan ke outbox (savePatrolReport), bukan dibuang
        diam-diam karena isOffline. Tanpa ini laporan (aman/temuan) hanya ada di device pembuat.
Caller: Node test runner saat verifikasi jalur sinkronisasi laporan patroli lintas-device.
Dependensi: src/context/AppContextRuntime.jsx, src/services/backend/patrolReports.js.
Main Functions: Memastikan syncPatrolReportToDomain tidak bail saat offline namun tetap melewati
        upload media saat offline, dan savePatrolReport mengantrekan ke outbox saat gagal tulis.
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

function extractSyncPatrolReportToDomain(source) {
  const startIndex = source.indexOf('const syncPatrolReportToDomain = useCallback');
  assert.notEqual(startIndex, -1, 'syncPatrolReportToDomain harus ada di runtime');
  // Cukup ambil potongan awal fungsi sampai penjaga + skip media.
  return source.slice(startIndex, startIndex + 2500);
}

test('syncPatrolReportToDomain TIDAK berhenti saat offline (agar masuk outbox)', () => {
  const fn = extractSyncPatrolReportToDomain(runtimeSource);
  assert.match(
    fn,
    /if \(!isCloudSyncEnabled \|\| !isCloudWriteEnabled \|\| !hasOperationalCloudAccess\) return null;/,
    'penjaga awal tidak boleh menyertakan isOffline — submit offline harus tetap ditulis/antre',
  );
  assert.doesNotMatch(
    fn,
    /if \([^\n]*!hasOperationalCloudAccess \|\| isOffline\) return null;/,
    'penjaga awal yang lama (memakai isOffline) tidak boleh muncul kembali',
  );
});

test('syncPatrolReportToDomain tetap melewati upload media saat offline', () => {
  assert.match(
    runtimeSource,
    /if \(!hasLocalMedia \|\| options\.skipMediaUpload \|\| isOffline \|\| patrolReportDomainUploadInFlightRef\.current\.has\(reportKey\)\)/,
    'upload media harus dilewati saat offline (Storage tak terjangkau), baris laporan tetap diantrekan',
  );
});

test('savePatrolReport mengantrekan laporan gagal ke outbox dengan id deterministik', () => {
  assert.match(
    patrolReportsSource,
    /enqueueOutboxMutation\(\{[\s\S]*?id: report\?\.clientEventId \|\| report\?\.client_event_id \|\| createClientEventId\(report\)[\s\S]*?type: 'patrol_report\.upsert'/,
    'kegagalan tulis (mis. offline) harus diantrekan ke outbox dengan id per-checkpoint',
  );
});
