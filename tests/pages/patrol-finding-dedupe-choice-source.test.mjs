/*
Tujuan: Mencegah regresi pilihan Temuan Baru/Temuan Lama saat checkpoint sudah punya temuan open.
Caller: Node test runner (node --test tests/pages/*.mjs).
Dependensi: AppContextRuntime, IncidentDetailView, AppShell, dan modal PatrolFindingChoiceModal.
Main Functions: Mengunci pencarian temuan lama open, matching kapal ternormalisasi, cleanup state, dan auto-open form update.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtimeSource = readFileSync(new URL('../../src/context/AppContextRuntime.jsx', import.meta.url), 'utf8');
const detailSource = readFileSync(new URL('../../src/components/views/IncidentDetailView.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const modalSource = readFileSync(new URL('../../src/components/modals/PatrolFindingChoiceModal.jsx', import.meta.url), 'utf8');
const statusSource = readFileSync(new URL('../../src/utils/incidentStatus.js', import.meta.url), 'utf8');

function sliceBetween(source, startNeedle, endNeedle) {
  const startIndex = source.indexOf(startNeedle);
  assert.notEqual(startIndex, -1, `${startNeedle} harus ada`);
  const endIndex = source.indexOf(endNeedle, startIndex);
  assert.notEqual(endIndex, -1, `${endNeedle} harus muncul setelah ${startNeedle}`);
  return source.slice(startIndex, endIndex);
}

test('status temuan memakai resolver incidentMeta bersama yang mendukung key patrol turunan', () => {
  assert.match(statusSource, /export function buildIncidentMetaKeyCandidates/);
  assert.match(statusSource, /candidates\.add\(`p-\$\{checkpointToken\}`\)/);
  assert.match(statusSource, /candidates\.add\(`p-\$\{checkpointToken\}-\$\{completedToken\}`\)/);
  assert.match(statusSource, /export function resolveIncidentMetaRecord/);
  assert.match(statusSource, /export function getIncidentStatus/);
  assert.match(detailSource, /import \{ getIncidentStatus, resolveIncidentMetaRecord \} from '..\/..\/utils\/incidentStatus'/);
});

test('PETUGAS visibility dan manage temuan memakai shipId atau createShipNameKey, bukan exact shipName', () => {
  const canManageSlice = sliceBetween(runtimeSource, 'const canManageIncident = useCallback', 'const canCloseIncident = useCallback');
  assert.match(canManageSlice, /const assignedShipId = String\(assignedShipForCurrentUser\.id \|\| ''\)/);
  assert.match(canManageSlice, /const incidentShipId = String\(incident\.shipId \|\| ''\)/);
  assert.match(canManageSlice, /assignedShipId === incidentShipId/);
  assert.match(canManageSlice, /createShipNameKey\(assignedShipForCurrentUser\.name\)/);
  assert.match(canManageSlice, /createShipNameKey\(incident\.shipName\)/);
  assert.doesNotMatch(canManageSlice, /incident\.shipName === assignedShipForCurrentUser\.name/);

  const visibleSlice = sliceBetween(runtimeSource, 'const visibleIncidents = useMemo', 'const isSameFindingShip = useCallback');
  assert.match(visibleSlice, /const assignedShipKey = createShipNameKey\(assignedShipForCurrentUser\.name\)/);
  assert.match(visibleSlice, /const targetShipKeys = ensureArray\(incident\.targetShipNames\)\.map\(createShipNameKey\)/);
  assert.doesNotMatch(visibleSlice, /targetShipNames\.includes\(assignedShipForCurrentUser\.name\)/);
});

test('handleActionClick TEMUAN mencari open finding sebelum membuka kamera', () => {
  const helperSlice = sliceBetween(runtimeSource, 'const getOpenFindingsForCheckpoint = useCallback', 'useEffect(() => {');
  assert.match(helperSlice, /resolveIncidentMetaRecord\(incidentMeta, incident\)/);
  assert.match(helperSlice, /getIncidentStatus\(incident, metaRecord\) !== 'open'/);
  assert.match(helperSlice, /canManageIncident\(incident\)/);
  assert.match(helperSlice, /isSameFindingShip\(incident, checkpoint\)/);
  assert.match(helperSlice, /String\(incident\.checkpointId\) === cpId/);
  assert.match(helperSlice, /createCheckpointNameKey\(incident\.location \|\| ''\) === cpNameKey/);

  const actionSlice = sliceBetween(runtimeSource, 'const handleActionClick = useCallback', 'const handleFormChange = useCallback');
  assert.match(actionSlice, /if \(type === 'temuan'\)/);
  assert.match(actionSlice, /const openFindings = getOpenFindingsForCheckpoint\(checkpoint\)/);
  assert.match(actionSlice, /setPatrolFindingChoice\(\{/);
  assert.match(actionSlice, /return;/);
  assert.match(actionSlice, /setPendingPatrolCameraCapture\(\{ id, type \}\)/);
});

test('openFindingUpdate membersihkan state patrol sebelum membuka detail update', () => {
  const updateSlice = sliceBetween(runtimeSource, 'const openFindingUpdate = useCallback', 'const handleActionClick = useCallback');
  assert.match(updateSlice, /setActiveForms\(\{\}\)/);
  assert.match(updateSlice, /setPendingPatrolCameraCapture\(null\)/);
  assert.match(updateSlice, /setSelectedReportDetail\(null\)/);
  assert.match(updateSlice, /setShowIncidentModal\(false\)/);
  assert.match(updateSlice, /setSelectedHistoryId\(null\)/);
  assert.match(updateSlice, /setSelectedIncident\(finding\)/);
  assert.match(updateSlice, /setPendingIncidentUpdateOpen\(finding\.id\)/);
});

test('IncidentDetailView auto membuka tab Update dan form update untuk temuan lama', () => {
  assert.match(detailSource, /pendingIncidentUpdateOpen, setPendingIncidentUpdateOpen/);
  const effectSlice = sliceBetween(detailSource, 'if (pendingIncidentUpdateOpen !== selectedIncident.id) return;', 'if (!selectedIncident)');
  assert.match(effectSlice, /setActiveTab\('update'\)/);
  assert.match(effectSlice, /setShowUpdateForm\(true\)/);
  assert.match(effectSlice, /setPendingIncidentUpdateOpen\(null\)/);
});

test('PatrolFindingChoiceModal dirender global dari AppShell sebelum kamera patroli', () => {
  assert.match(appSource, /import PatrolFindingChoiceModal from '\.\/src\/components\/modals\/PatrolFindingChoiceModal'/);
  assert.match(appSource, /const \{ pendingPatrolCameraCapture, patrolFindingChoice, activePatrolItem \} = usePatrol\(\)/);
  assert.match(appSource, /\{patrolFindingChoice && <PatrolFindingChoiceModal \/>\}[\s\S]*?\{pendingPatrolCameraCapture && <PatrolCameraModal \/>\}/);

  assert.match(modalSource, /chooseNewPatrolFinding/);
  assert.match(modalSource, /openFindingUpdate\(openFindings\[0\]\)/);
  assert.match(modalSource, /openFindings\.map/);
  assert.match(modalSource, /Update temuan lama tidak membuat laporan patroli baru/);
});
