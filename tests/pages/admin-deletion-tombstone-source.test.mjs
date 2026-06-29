/*
Tujuan: Mencegah regresi data admin yang sudah dihapus muncul kembali dari Realtime/cloud snapshot.
Caller: Node test runner saat verifikasi delete history, incident, dan notifikasi stale.
Dependensi: src/context/AppContextRuntime.jsx.
Main Functions: Mengunci tombstone ref otoritatif, filter subscription domain, dan filter notifikasi.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtimeSource = readFileSync(
  new URL('../../src/context/AppContextRuntime.jsx', import.meta.url),
  'utf8',
);

function extractSlice(startNeedle, endNeedle) {
  const startIndex = runtimeSource.indexOf(startNeedle);
  assert.notEqual(startIndex, -1, `${startNeedle} harus ada`);
  const endIndex = runtimeSource.indexOf(endNeedle, startIndex);
  assert.notEqual(endIndex, -1, `${endNeedle} harus muncul setelah ${startNeedle}`);
  return runtimeSource.slice(startIndex, endIndex);
}

test('snapshot dan inbox memfilter notifikasi stale berdasarkan historyId dan incidentId', () => {
  const helperSlice = extractSlice(
    'function omitNotificationsForDeletedEntities',
    'function remapUserIdFromMap',
  );

  assert.match(helperSlice, /const historyId = sanitizeText\(notification\.historyId \|\| routeParams\.historyId/);
  assert.match(helperSlice, /const incidentId = sanitizeText\(notification\.incidentId \|\| routeParams\.incidentId/);
  assert.match(helperSlice, /deletedHistoryEntries\[historyId\]/);
  assert.match(helperSlice, /deletedIncidents\[incidentId\]/);
  assert.match(helperSlice, /notificationType\.endsWith\('_deleted'\)/);
  assert.doesNotMatch(
    helperSlice,
    /deletedRecords\.ships/,
    'default Opsi A tidak boleh cascade-hide semua notifikasi hanya karena ship dihapus',
  );

  assert.match(
    runtimeSource,
    /notifications: omitNotificationsForDeletedEntities\(notifications, deletedRecords\)/,
    'createSharedStateSnapshot harus membersihkan notifikasi sebelum local/cloud persistence',
  );
  assert.match(
    runtimeSource,
    /notifications: omitNotificationsForDeletedEntities\([\s\S]*?mergeNotificationsCollection/,
    'mergeSharedStateSnapshots harus membersihkan notifikasi stale saat hydrate cloud',
  );
  assert.match(
    runtimeSource,
    /return omitNotificationsForDeletedEntities\(notifications, deletedRecords\)\.filter/,
    'visibleNotifications harus menahan notifikasi stale yang masih ada di state mentah',
  );
});

test('handler delete memakai tombstone ref otoritatif dan apply cloud tidak menimpa tombstone baru', () => {
  assert.match(runtimeSource, /const deletedRecordsRef = useRef\(deletedRecords\)/);
  assert.match(runtimeSource, /const updateDeletedRecords = useCallback\(\(updater\) => \{/);
  assert.match(runtimeSource, /deletedRecordsRef\.current = nextDeletedRecords/);
  assert.match(runtimeSource, /deletedRecordsRef\.current = createDeletedRecordsState\(deletedRecords\)/);

  const applySlice = extractSlice(
    'const applyCloudSharedState = useCallback',
    'const handleIncomingCloudPayloadRef',
  );
  assert.match(applySlice, /deletedRecords: mergeDeletedRecords\(/);
  assert.match(applySlice, /localSharedStateRef\.current\?\.deletedRecords \|\| \{\}/);
  assert.match(applySlice, /deletedRecordsRef\.current \|\| \{\}/);
  assert.match(applySlice, /updateDeletedRecords\(normalizedState\.deletedRecords\)/);

  assert.match(runtimeSource, /updateDeletedRecords\(previousDeletedRecords => markDeletedRecord\(previousDeletedRecords, 'historyEntries'/);
  assert.match(runtimeSource, /updateDeletedRecords\(previousDeletedRecords => markDeletedRecord\(previousDeletedRecords, 'ships'/);
  assert.match(runtimeSource, /updateDeletedRecords\(previousDeletedRecords => markDeletedRecord\(previousDeletedRecords, 'users'/);
  assert.match(runtimeSource, /updateDeletedRecords\(\(previousDeletedRecords\) => markDeletedRecord\(previousDeletedRecords, 'incidents'/);
});

test('state awal dari localStorage sudah disaring oleh deletedRecords', () => {
  const initSlice = extractSlice(
    'export function AppProvider',
    '// Theme & connectivity',
  );

  assert.match(initSlice, /const initialDeletedRecords = createDeletedRecordsState\(persistedState\?\.deletedRecords\)/);
  assert.match(initSlice, /normalizeShipsCollection\(persistedState\?\.shipsData \|\| getInitialShipsData\(\)\)[\s\S]*?initialDeletedRecords\.ships/);
  assert.match(initSlice, /normalizeUsersCollection\(persistedState\?\.usersData \|\| getMockUsersList\(\)\)[\s\S]*?initialDeletedRecords\.users/);
  assert.match(initSlice, /sortHistoryEntries\(persistedState\?\.historyEntries \|\| createSeedHistoryEntries\(\)\)[\s\S]*?initialDeletedRecords\.historyEntries/);
  assert.match(runtimeSource, /persistedState\?\.incidentsData \|\| \[\][\s\S]*?initialDeletedRecords\.incidents/);
  assert.match(runtimeSource, /Object\.entries\(persistedState\?\.incidentMeta \|\| \{\}\)[\s\S]*?!initialDeletedRecords\.incidents\[incidentId\]/);
  assert.match(runtimeSource, /omitNotificationsForDeletedEntities\(persistedState\?\.notifications \|\| \[\], initialDeletedRecords\)/);
  assert.match(runtimeSource, /const \[deletedRecords, setDeletedRecords\] = useState\(\(\) => initialDeletedRecords\)/);
});

test('subscription incidents dan shift history menghormati deletedRecordsRef sebelum setState', () => {
  const incidentsSlice = extractSlice(
    'const unsubIncidents = subscribeToIncidents',
    '// Subscribe ke shift_history_entries',
  );
  assert.match(incidentsSlice, /const mergedIncidents = omitDeletedEntities\(/);
  assert.match(incidentsSlice, /mergeIncidentsCollection\(localOnlyIncidents, reconciledDomainIncidents\)/);
  assert.match(incidentsSlice, /deletedRecordsRef\.current\.incidents/);
  assert.match(incidentsSlice, /const visibleDomainIncidentMeta = Object\.fromEntries/);
  assert.match(incidentsSlice, /!deletedRecordsRef\.current\.incidents\?\.\[incidentId\]/);

  const historySlice = extractSlice(
    'const unsubShiftHistory = subscribeToShiftHistoryEntries',
    'useEffect(() => {',
  );
  assert.match(historySlice, /const nextEntries = omitDeletedEntities\(/);
  assert.match(historySlice, /mergeHistoryEntries\(prev, serverEntries\)/);
  assert.match(historySlice, /deletedRecordsRef\.current\.historyEntries/);
  assert.match(historySlice, /serializeSharedStateSnapshot\(nextEntries\) === serializeSharedStateSnapshot\(prev\)/);
});

test('persistensi notifikasi ke cloud tidak mengirim notifikasi stale', () => {
  const syncSlice = extractSlice(
    'const notificationSyncRef = useRef(new Map())',
    '// Weather',
  );
  assert.match(syncSlice, /omitNotificationsForDeletedEntities\(notifications, deletedRecords\)\.forEach/);
  assert.match(syncSlice, /\}, \[currentUserId, deletedRecords, hasOperationalCloudAccess, isOffline, notifications\]\)/);
});
