/*
Tujuan: Mencegah regresi bug "foto temuan dari Lapor Baru tidak muncul di device lain" — foto
        SAMPUL temuan tidak boleh ditulis ke baris durable `incidents` sebagai key idb:// milik
        perangkat pembuat (key itu tak bisa di-resolve di device lain → galeri kosong walau
        tercatat "1 foto"). Foto wajib diunggah ke Storage lalu baris ditulis ulang dengan https.
Caller: Node test runner saat verifikasi jalur sinkronisasi foto temuan lintas-device.
Dependensi: src/context/AppContextRuntime.jsx.
Main Functions: Memastikan handleSubmitIncident men-strip foto sampul lokal pada tulisan durable,
        memicu healIncidentCoverMedia, dan ada efek heal yang berjalan saat online.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtimeSource = readFileSync(
  new URL('../../src/context/AppContextRuntime.jsx', import.meta.url),
  'utf8',
);

test('handleSubmitIncident TIDAK menulis key idb:// foto sampul ke baris durable', () => {
  const startIndex = runtimeSource.indexOf('const handleSubmitIncident = useCallback');
  assert.notEqual(startIndex, -1, 'handleSubmitIncident harus ada');
  const fn = runtimeSource.slice(startIndex, startIndex + 4200);

  assert.match(
    fn,
    /const durableIncident = \{[\s\S]*?photoUrl: stripLocalAssetUrlSync\(newIncident\.photoUrl\)[\s\S]*?heroUrl: stripLocalAssetUrlSync\(newIncident\.heroUrl\)[\s\S]*?thumbUrl: stripLocalAssetUrlSync\(newIncident\.thumbUrl\)/,
    'foto sampul lokal (idb://) di-strip → null untuk tulisan durable agar tak bocor ke cloud',
  );
  assert.match(
    fn,
    /void saveIncidentReport\(durableIncident, \{ clientUpdatedAt: trustedTimestamp\.occurredAtClientMs \}\)/,
    'baris durable ditulis dari record yang sudah di-strip, bukan newIncident mentah',
  );
  assert.match(
    fn,
    /void healIncidentCoverMedia\(newIncident\)/,
    'setelah submit, healIncidentCoverMedia dipicu untuk mengunggah foto sampul ke Storage',
  );
});

test('healIncidentCoverMedia mengunggah foto sampul lokal lalu tulis ulang baris https', () => {
  const startIndex = runtimeSource.indexOf('const healIncidentCoverMedia = useCallback');
  assert.notEqual(startIndex, -1, 'healIncidentCoverMedia harus ada');
  const fn = runtimeSource.slice(startIndex, startIndex + 3400);

  assert.match(
    fn,
    /const hasLocalCover =[\s\S]*?isLocalOnlyAssetUrl\(incident\.photoUrl\)[\s\S]*?if \(!hasLocalCover\) return false;/,
    'hanya proses temuan yang foto sampulnya masih lokal (idb://)',
  );
  assert.match(
    fn,
    /if \(incidentDomainUploadInFlightRef\.current\.has\(uploadKey\)\) return false;/,
    'cegah upload ganda lewat penjaga in-flight',
  );
  assert.match(
    fn,
    /await prepareCloudPhotoUrl\(incident\.photoUrl, \['incidents', incidentId, 'photo', incident\.photoUrl\]\)/,
    'foto penuh diunggah ke Storage di bawah path incidents/<id>/photo',
  );
  assert.match(
    fn,
    /setIncidentsData\(\(previousIncidents\) =>[\s\S]*?photoUrl: nextPhotoUrl/,
    'selaraskan state lokal ke URL https agar konvergen (tidak diunggah ulang)',
  );
  assert.match(
    fn,
    /await syncIncidentDetailToDomain\([\s\S]*?photoUrl: nextPhotoUrl[\s\S]*?meta \|\| \{\}/,
    'tulis ulang baris durable lewat syncIncidentDetailToDomain agar dokumentasi/progress tak terhapus',
  );
});

test('efek heal foto sampul temuan berjalan saat online untuk temuan berfoto lokal', () => {
  assert.match(
    runtimeSource,
    /const pendingCoverIncidents = ensureArray\(incidentsData\)\.filter\(\(incident\) => \([\s\S]*?isLocalOnlyAssetUrl\(incident\?\.photoUrl\)/,
    'efek menyaring temuan yang foto sampulnya masih lokal',
  );
  assert.match(
    runtimeSource,
    /for \(const incident of pendingCoverIncidents\) \{[\s\S]*?await healIncidentCoverMedia\(incident, incidentMeta\[incident\.id\] \|\| \{\}\)/,
    'efek memanggil healIncidentCoverMedia untuk tiap temuan berfoto lokal',
  );
});
