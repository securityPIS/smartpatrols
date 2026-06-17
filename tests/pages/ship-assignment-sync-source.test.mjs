/*
Tujuan: Mengunci source assignment kru agar tidak lagi tersapu state-sync stale.
Caller: Node test runner.
Dependensi: File source AppContextRuntime, cloudState, access, smartpatrol Edge helper, dan migration RPC assignment.
Main Functions: Validasi statis RPC atomik, client assignment path, dan skip no-op state-sync.
Side Effects: Tidak ada; test hanya membaca source.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appContextSource = readFileSync(new URL('../../src/context/AppContextRuntime.jsx', import.meta.url), 'utf8');
const accessSource = readFileSync(new URL('../../src/services/backend/access.js', import.meta.url), 'utf8');
const cloudStateSource = readFileSync(new URL('../../src/services/backend/cloudState.js', import.meta.url), 'utf8');
const edgeSharedSource = readFileSync(new URL('../../supabase/functions/_shared/smartpatrol.ts', import.meta.url), 'utf8');
const migrationSource = readFileSync(new URL('../../supabase/migrations/20260617151542_atomic_ship_personnel_assignment.sql', import.meta.url), 'utf8');

test('admin assignment RPC updates profile and ship in one guarded database function', () => {
  assert.match(migrationSource, /create or replace function public\.admin_set_ship_personnel_assignment/);
  assert.match(migrationSource, /if not public\.is_admin\(\) then/);
  assert.match(migrationSource, /update public\.ships[\s\S]*personnel = to_jsonb\(v_current_ids\)/);
  assert.match(migrationSource, /update public\.profiles[\s\S]*ship_assigned = v_next_ship_assigned[\s\S]*status = v_next_status/);
  assert.match(migrationSource, /insert into public\.client_mutations/);
});

test('client assignment handlers call atomic RPC before local mutation', () => {
  assert.match(accessSource, /export async function syncShipPersonnelAssignment/);
  assert.match(accessSource, /supabase\.rpc\('admin_set_ship_personnel_assignment'/);
  assert.match(appContextSource, /const persistShipPersonnelAssignment = useCallback/);
  assert.match(appContextSource, /const assignmentWrite = await persistShipPersonnelAssignment\(\{[\s\S]*?assign: false/);
  assert.match(appContextSource, /const assignmentWrite = await persistShipPersonnelAssignment\(\{[\s\S]*?assign: true/);
  assert.match(appContextSource, /if \(!assignmentWrite\.ok\) return;/);
});

test('state sync skips unchanged profiles and ships to prevent updated_at write storms', () => {
  assert.match(cloudStateSource, /async function filterChangedRowsById/);
  assert.match(cloudStateSource, /changedProfileRows = await filterChangedRowsById\(/);
  assert.match(cloudStateSource, /changedShipRows = await filterChangedRowsById\(/);
  assert.match(cloudStateSource, /if \(changedProfileRows\.length === 0 && changedShipRows\.length === 0\) \{[\s\S]*?return state;/);
  assert.match(cloudStateSource, /users: changedProfileRows\.length/);
  assert.match(cloudStateSource, /ships: changedShipRows\.length/);
});

test('petugas with ship assignment normalizes to active unless disabled', () => {
  assert.match(appContextSource, /role === ACCESS_ROLES\.PETUGAS[\s\S]*?\(status === 'disabled' \? 'disabled' : \(shipAssigned \? 'active' : 'off-duty'\)\)/);
  assert.match(accessSource, /role === 'PETUGAS'[\s\S]*?\(shipAssigned \? 'active' : 'off-duty'\)/);
  assert.match(cloudStateSource, /role === 'PETUGAS'[\s\S]*?\(shipAssigned \? 'active' : 'off-duty'\)/);
  assert.match(edgeSharedSource, /if \(!shipAssigned\) return 'off-duty';\s*return 'active';/);
});
