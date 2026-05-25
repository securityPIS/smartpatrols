/*
Tujuan: Memastikan filter data user tetap akurat saat admin mencari personil operasional.
Caller: Node test runner saat verifikasi halaman data user.
Dependensi: src/utils/userFilters.js.
Main Functions: Menguji text search dan dropdown filter kapal, instansi, serta role.
Side Effects: Tidak ada; test memakai data dummy in-memory.
*/

import test from 'node:test';
import assert from 'node:assert/strict';

import { filterUsers, getUserFilterOptions } from '../../src/utils/userFilters.js';

const users = [
  {
    id: 'u-admin',
    name: 'Rina Admin',
    email: 'rina@smartpatrol.local',
    role: 'ADMIN',
    type: 'INTERNAL',
    shipAssigned: '',
    workerNumber: 'ADM-001',
  },
  {
    id: 'u-alpha',
    name: 'Budi Pratama',
    email: 'budi@bujp.local',
    role: 'PETUGAS',
    type: 'BUJP',
    shipAssigned: 'KM Alpha',
    workerNumber: 'BUJP-204',
  },
  {
    id: 'u-beta',
    name: 'Sari Wibowo',
    email: 'sari@tni.local',
    role: 'PIC',
    type: 'TNI',
    shipAssigned: 'KM Beta',
    workerNumber: 'TNI-778',
  },
];

test('filterUsers combines text, ship, agency, and role filters', () => {
  const result = filterUsers(users, {
    text: 'budi',
    ship: 'KM Alpha',
    agency: 'BUJP',
    role: 'PETUGAS',
  });

  assert.deepEqual(result.map((user) => user.id), ['u-alpha']);
});

test('filterUsers searches identity fields case-insensitively', () => {
  const result = filterUsers(users, { text: 'tni-778' });

  assert.deepEqual(result.map((user) => user.id), ['u-beta']);
});

test('getUserFilterOptions returns sorted unique dropdown options', () => {
  const options = getUserFilterOptions(users, [{ name: 'KM Gamma' }, { name: 'KM Alpha' }]);

  assert.deepEqual(options.ships, ['KM Alpha', 'KM Beta', 'KM Gamma']);
  assert.deepEqual(options.agencies, ['BUJP', 'INTERNAL', 'TNI']);
  assert.deepEqual(options.roles, ['ADMIN', 'PETUGAS', 'PIC']);
});
