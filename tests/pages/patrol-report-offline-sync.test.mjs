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
    /if \(!isCloudSyncEnabled \|\| !isCloudWriteEnabled\) \{/,
    'penjaga config terpisah (tanpa isOffline) supaya submit offline tetap ditulis/antre',
  );
  assert.match(
    fn,
    /if \(!hasOperationalCloudAccess\) \{/,
    'penjaga akses terpisah supaya bisa memunculkan status no-access ke layar',
  );
  assert.doesNotMatch(
    fn,
    /!hasOperationalCloudAccess \|\| isOffline/,
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

test('submit patroli meminta notifikasi error di layar (notifyOnError)', () => {
  assert.match(
    runtimeSource,
    /void syncPatrolReportToDomain\(submittedItem, \{ notifyOnError: true \}\);/,
    'handleSubmitPatrol harus minta notifikasi bila laporan gagal/terblokir sampai ke server',
  );
});

test('notifyPatrolSyncIssue memunculkan dialog untuk no-access dan blocked', () => {
  const startIndex = runtimeSource.indexOf('const notifyPatrolSyncIssue = useCallback');
  assert.notEqual(startIndex, -1, 'notifyPatrolSyncIssue harus ada');
  const fn = runtimeSource.slice(startIndex, startIndex + 2600);
  assert.match(fn, /syncStatus === 'no-access'[\s\S]*?setConfirmDialog\(/, 'tampilkan dialog saat akses cloud tidak aktif');
  assert.match(fn, /syncStatus === 'blocked'[\s\S]*?setConfirmDialog\(/, 'tampilkan dialog saat server menolak (RLS/constraint)');
  assert.match(fn, /status\.error[\s\S]*?\.hint/, 'sertakan message/hint error agar penyebab terlihat di layar');
});

test('savePatrolReport menandai syncError untuk penolakan server (bukan offline)', () => {
  assert.match(
    patrolReportsSource,
    /const offline = \(typeof navigator[\s\S]*?syncError: offline \? null : \{[\s\S]*?code: error\?\.code/,
    'gagal saat online (RLS dll) harus membawa syncError; offline tidak',
  );
});

test('healPatrolReportMedia mengunggah ulang foto lokal lalu tulis https sekali', () => {
  const startIndex = runtimeSource.indexOf('const healPatrolReportMedia = useCallback');
  assert.notEqual(startIndex, -1, 'healPatrolReportMedia harus ada');
  const fn = runtimeSource.slice(startIndex, startIndex + 2600);

  assert.match(
    fn,
    /const hasLocalMedia =[\s\S]*?if \(!hasLocalMedia\) return;/,
    'hanya proses checkpoint yang fotonya masih lokal (idb://)',
  );
  assert.match(
    fn,
    /if \(!reportKey \|\| patrolReportDomainUploadInFlightRef\.current\.has\(reportKey\)\) return;/,
    'cegah upload ganda lewat penjaga in-flight',
  );
  assert.match(
    fn,
    /if \(!mediaReady\) return;[\s\S]*?mediaStatus: 'ready'[\s\S]*?await savePatrolReport\(readyReport/,
    'tulis baris laporan SEKALI dengan URL https (tanpa strip-null) setelah upload sukses',
  );
  assert.match(
    fn,
    /setCheckpointsByShip\(\(previousState\) => \{[\s\S]*?photoUrl: readyReport\.photoUrl/,
    'selaraskan state lokal ke URL https agar konvergen (tidak diunggah ulang)',
  );
});

test('efek heal foto patroli berjalan saat online untuk checkpoint completed berfoto lokal', () => {
  assert.match(
    runtimeSource,
    /if \(isOffline \|\| !isCloudSyncEnabled \|\| !isCloudWriteEnabled \|\| !hasOperationalCloudAccess \|\| !cloudSyncBootstrapped\) \{\s*\n\s*return undefined;/,
    'efek hanya jalan saat online + punya akses cloud + sudah bootstrap',
  );
  assert.match(
    runtimeSource,
    /pendingMediaCheckpoints[\s\S]*?checkpoint\?\.status === 'completed'[\s\S]*?isLocalOnlyAssetUrl\(checkpoint\?\.photoUrl\)/,
    'efek menyaring checkpoint completed yang fotonya masih lokal',
  );
  assert.match(
    runtimeSource,
    /for \(const checkpoint of pendingMediaCheckpoints\) \{[\s\S]*?await healPatrolReportMedia\(checkpoint\)/,
    'efek memanggil healPatrolReportMedia untuk tiap checkpoint berfoto lokal',
  );
});
