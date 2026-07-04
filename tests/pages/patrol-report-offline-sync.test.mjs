/*
Tujuan: Mencegah regresi bug "laporan offline tak muncul di device lain" — submit patroli saat
        offline HARUS tetap diproses agar diantrekan ke outbox (savePatrolReport), bukan dibuang
        diam-diam karena isOffline. Tanpa ini laporan (aman/temuan) hanya ada di device pembuat.
Caller: Node test runner saat verifikasi jalur sinkronisasi laporan patroli lintas-device.
Dependensi: src/context/AppContextRuntime.jsx, src/services/backend/patrolReports.js.
Main Functions: Memastikan syncPatrolReportToDomain tidak bail saat offline namun tetap melewati
        upload media saat offline, submit melakukan prequeue lokal, dan savePatrolReport
        mengantrekan ke outbox saat gagal tulis.
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
const incidentReportsSource = readFileSync(
  new URL('../../src/services/backend/incidentReports.js', import.meta.url),
  'utf8',
);
const trustedTimeSource = readFileSync(
  new URL('../../src/services/time/trustedTime.js', import.meta.url),
  'utf8',
);

function extractSyncPatrolReportToDomain(source) {
  const startIndex = source.indexOf('const syncPatrolReportToDomain = useCallback');
  assert.notEqual(startIndex, -1, 'syncPatrolReportToDomain harus ada di runtime');
  // Cukup ambil potongan awal fungsi sampai penjaga + skip media.
  return source.slice(startIndex, startIndex + 5200);
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
    /if \(!hasOperationalCloudAccess\) \{[\s\S]*?queuePatrolReportForRetry\(pendingReport/,
    'akses cloud transient harus antre pendingReport, bukan berhenti lokal saja',
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
    /const mutationId = resolveReportMutationId\(report\);[\s\S]*?enqueueOutboxMutation\(\{[\s\S]*?id: mutationId[\s\S]*?type: 'patrol_report\.upsert'/,
    'kegagalan tulis (mis. offline) harus diantrekan ke outbox dengan id per-checkpoint',
  );
});

test('savePatrolReport membersihkan outbox bila direct save berhasil', () => {
  assert.match(
    patrolReportsSource,
    /import \{ enqueueOutboxMutation, registerOutboxHandler, removeOutboxMutation \} from '\.\/outbox';[\s\S]*?const saved = await writePatrolReport\(report, options\);[\s\S]*?await removeOutboxMutation\(mutationId\);/,
    'direct save sukses harus menghapus antrean lokal checkpoint yang sama agar outbox lama tidak menimpa record ready',
  );
});

test('submit patroli prequeue lokal sebelum sync cloud background', () => {
  assert.match(
    runtimeSource,
    /const durableSyncStatus = await syncPatrolReportToDomain\(submittedItem, \{[\s\S]*?durableQueueOnly: true,[\s\S]*?notifyOnError: true,[\s\S]*?skipMediaUpload: true,[\s\S]*?\}\);/,
    'handleSubmitPatrol harus menunggu laporan masuk outbox lokal sebelum melepas flow submit',
  );
  assert.match(
    runtimeSource,
    /if \(!\['blocked', 'no-access'\]\.includes\(durableSyncStatus\?\.syncStatus\)\) \{[\s\S]*?void syncPatrolReportToDomain\(submittedItem, \{ notifyOnError: true \}\);/,
    'setelah durable queue aman, sync cloud/media boleh lanjut di background dengan notifikasi error',
  );
});

test('syncPatrolReportToDomain punya mode durableQueueOnly', () => {
  const fn = extractSyncPatrolReportToDomain(runtimeSource);
  assert.match(
    fn,
    /if \(options\.durableQueueOnly && !isDefinitiveAccessDenied\) \{[\s\S]*?queuePatrolReportForRetry\(pendingReport,[\s\S]*?reason: options\.durableQueueReason \|\| 'submit-durable-prequeue'/,
    'mode durableQueueOnly harus menulis pendingReport ke outbox sebelum jalur network',
  );
  assert.match(
    fn,
    /patrolReportDomainWriteCacheRef\.current\.set\(reportKey, serializedPendingReport\)/,
    'prequeue sukses harus mengisi write cache agar pending write direct tidak menduplikasi antrean',
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

test('kolom *_ms bigint dipaksa integer (cegah error invalid input syntax for type bigint)', () => {
  assert.match(
    trustedTimeSource,
    /const nowMs = Math\.round\(getTrustedNowMs\(\)\)/,
    'trusted time harus membulatkan nowMs (performance.now() berkoma) agar bukan pecahan',
  );
  assert.match(
    patrolReportsSource,
    /occurred_at_trusted_ms: Number\.isFinite\(report\.occurredAtTrustedMs\) \? Math\.round\(report\.occurredAtTrustedMs\) : null/,
    'patrol_reports.occurred_at_trusted_ms harus integer (Math.round)',
  );
  assert.match(
    patrolReportsSource,
    /client_updated_at_ms: Math\.round\(clientUpdatedAt\)/,
    'patrol_reports.client_updated_at_ms harus integer',
  );
  assert.match(
    incidentReportsSource,
    /occurred_at_trusted_ms: Number\.isFinite\(incident\.occurredAtTrustedMs\) \? Math\.round\(incident\.occurredAtTrustedMs\) : null/,
    'incidents.occurred_at_trusted_ms harus integer',
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
