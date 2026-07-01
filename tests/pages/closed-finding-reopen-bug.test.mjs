/*
Tujuan: Mencegah regresi bug "temuan yang sudah ditutup admin kembali ke open".
Caller: Node test runner (node --test tests/pages/*.mjs).
Dependensi: AppContextRuntime (handler progress/dokumentasi) dan cloudState buildStatePayload.
Main Functions: Mengunci pemakaian getIncidentStatus untuk mempertahankan status closed saat
        menambah progress/dokumentasi, dan memastikan hydrate cloud membawa status durable ke incidentMeta.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtimeSource = readFileSync(new URL('../../src/context/AppContextRuntime.jsx', import.meta.url), 'utf8');
const cloudStateSource = readFileSync(new URL('../../src/services/backend/cloudState.js', import.meta.url), 'utf8');

function sliceBetween(source, startNeedle, endNeedle) {
  const startIndex = source.indexOf(startNeedle);
  assert.notEqual(startIndex, -1, `${startNeedle} harus ada`);
  const endIndex = source.indexOf(endNeedle, startIndex);
  assert.notEqual(endIndex, -1, `${endNeedle} harus muncul setelah ${startNeedle}`);
  return source.slice(startIndex, endIndex);
}

test('handleAddProgress mempertahankan status closed lewat getIncidentStatus, bukan fallback ke open', () => {
  const slice = sliceBetween(
    runtimeSource,
    'const handleAddProgress = useCallback',
    'const handleAddIncidentDocumentation = useCallback',
  );
  assert.match(slice, /const preservedStatus = getIncidentStatus\(incident, baseMeta\)/);
  assert.match(slice, /status: preservedStatus/);
  // Fallback lama yang mereopen temuan tidak boleh muncul lagi di handler ini.
  assert.doesNotMatch(slice, /status: baseMeta\.status \|\| 'open'/);
  assert.doesNotMatch(slice, /status: prev\[incidentId\]\?\.status \|\| 'open'/);
});

test('handleAddIncidentDocumentation mempertahankan status closed lewat getIncidentStatus', () => {
  const slice = sliceBetween(
    runtimeSource,
    'const handleAddIncidentDocumentation = useCallback',
    'const handleUpdateIncidentInfo = useCallback',
  );
  assert.match(slice, /const preservedStatus = getIncidentStatus\(incident, baseMeta\)/);
  assert.match(slice, /status: preservedStatus/);
  assert.doesNotMatch(slice, /status: baseMeta\.status \|\| 'open'/);
  assert.doesNotMatch(slice, /status: previousMeta\[incidentId\]\?\.status \|\| 'open'/);
});

test('buildStatePayload membawa status non-open dari baris durable ke incidentMeta', () => {
  const slice = sliceBetween(cloudStateSource, 'const incidentMeta = {}', 'sosRows.forEach');
  assert.match(slice, /if \(incident\.status && incident\.status !== 'open'\)/);
  assert.match(slice, /metaEntry\.status = incident\.status/);
});
