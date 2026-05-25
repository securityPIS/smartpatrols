/*
Tujuan: Menjaga integritas state user saat admin mengubah penugasan kapal dan akses operasional.
Caller: Node test runner untuk regresi manajemen user.
Dependensi: src/utils/userManagement.js.
Main Functions: Menguji assignment eksklusif lintas kapal, override kosong untuk unassign, dan guard bootstrap armada.
Side Effects: Tidak ada; test memakai data dummy in-memory.
*/

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assignUserToExclusiveShip,
  reconcileUserShipAssignments,
  removeUserFromShipAssignment,
  resolveExplicitOverride,
  shouldDeferPetugasFleetValidation,
} from '../../src/utils/userManagement.js';

const baseShips = [
  {
    id: 'old',
    name: 'KM Lama',
    personnel: ['u1', 'u2'],
    personnelNextMonth: ['u2'],
    personnelSchedules: {
      u2: { startDate: '2026-05-01', endDate: '2026-05-31', isTBC: false },
    },
  },
  {
    id: 'new',
    name: 'KM Baru',
    personnel: [],
    personnelNextMonth: ['u2'],
    personnelSchedules: {
      u2: { startDate: '2026-06-01', endDate: '', isTBC: true },
    },
  },
];

test('assignUserToExclusiveShip removes stale current and next assignments from other ships', () => {
  const result = assignUserToExclusiveShip(baseShips, {
    userId: 'u2',
    targetShipId: 'new',
    scheduleType: 'current',
    schedule: { startDate: '2026-05-20', endDate: '2026-06-20', isTBC: false },
    mutationMeta: { updatedAt: '2026-05-20T10:00:00.000Z', updatedAtClientMs: 1, updatedAtTrustedMs: 2 },
  });

  const oldShip = result.find((ship) => ship.id === 'old');
  const newShip = result.find((ship) => ship.id === 'new');

  assert.deepEqual(oldShip.personnel, ['u1']);
  assert.deepEqual(oldShip.personnelNextMonth, []);
  assert.equal(oldShip.personnelSchedules.u2, undefined);
  assert.deepEqual(newShip.personnel, ['u2']);
  assert.deepEqual(newShip.personnelNextMonth, []);
  assert.deepEqual(newShip.personnelSchedules.u2, {
    startDate: '2026-05-20',
    endDate: '2026-06-20',
    isTBC: false,
  });
  assert.equal(newShip.updatedAt, '2026-05-20T10:00:00.000Z');
});

test('removeUserFromShipAssignment reports remaining current assignment on another ship', () => {
  const result = removeUserFromShipAssignment([
    { id: 'old', name: 'KM Lama', personnel: ['u2'], personnelNextMonth: [], personnelSchedules: { u2: {} } },
    { id: 'new', name: 'KM Baru', personnel: ['u2'], personnelNextMonth: [], personnelSchedules: { u2: {} } },
  ], {
    userId: 'u2',
    targetShipId: 'old',
    scheduleType: 'current',
    mutationMeta: { updatedAt: '2026-05-20T10:00:00.000Z' },
  });

  assert.deepEqual(result.ships.find((ship) => ship.id === 'old').personnel, []);
  assert.deepEqual(result.ships.find((ship) => ship.id === 'new').personnel, ['u2']);
  assert.deepEqual(result.remainingCurrentAssignment, { shipId: 'new', shipName: 'KM Baru' });
});

test('resolveExplicitOverride preserves an explicit empty string override', () => {
  assert.equal(
    resolveExplicitOverride({ shipAssigned: '' }, { shipAssigned: 'KM Lama' }, 'shipAssigned', ''),
    '',
  );
});

test('resolveExplicitOverride preserves an explicit null override (unassign vs seed fallback)', () => {
  // Regresi: petugas dengan seed shipAssigned masih nempel di kapal lama saat di-filter
  // karena normalizeUserRecord fallback ke seed ketika user.shipAssigned = null.
  assert.equal(
    resolveExplicitOverride({ shipAssigned: null }, { shipAssigned: 'MT MENGGALA' }, 'shipAssigned', ''),
    null,
  );
});

test('resolveExplicitOverride falls back to seed only when key is absent', () => {
  assert.equal(
    resolveExplicitOverride({}, { shipAssigned: 'MT MENGGALA' }, 'shipAssigned', ''),
    'MT MENGGALA',
  );
});

test('reconcileUserShipAssignments clears stale shipAssigned for PETUGAS not in any ship personnel', () => {
  // Regresi: filter DATA USER memunculkan 8 petugas di MT MENGGALA padahal ARMADA hanya menampilkan 3.
  const ships = [
    { id: 's1', name: 'MT MENGGALA', personnel: ['u3'] },
    { id: 's2', name: 'MT SRIWIJAYA', personnel: [] },
  ];
  const users = [
    { id: 'u1', role: 'ADMIN', shipAssigned: 'MT MENGGALA', status: 'active' },
    { id: 'u3', role: 'PETUGAS', shipAssigned: 'MT MENGGALA', status: 'active' },
    { id: 'u10', role: 'PETUGAS', shipAssigned: 'MT MENGGALA', status: 'active' },
    { id: 'u11', role: 'PETUGAS', shipAssigned: 'MT MENGGALA', status: 'active' },
  ];
  const result = reconcileUserShipAssignments(users, ships);
  const byId = (id) => result.find((u) => u.id === id);

  assert.equal(byId('u1').shipAssigned, 'MT MENGGALA', 'admin shipAssigned dipertahankan');
  assert.equal(byId('u3').shipAssigned, 'MT MENGGALA', 'petugas yang masih di personnel dipertahankan');
  assert.equal(byId('u3').status, 'active');
  assert.equal(byId('u10').shipAssigned, null, 'petugas stale dibersihkan');
  assert.equal(byId('u10').status, 'off-duty');
  assert.equal(byId('u11').shipAssigned, null);
});

test('reconcileUserShipAssignments returns same reference when no changes are needed', () => {
  const ships = [{ id: 's1', name: 'MT MENGGALA', personnel: ['u3'] }];
  const users = [{ id: 'u3', role: 'PETUGAS', shipAssigned: 'MT MENGGALA', status: 'active' }];
  const result = reconcileUserShipAssignments(users, ships);
  assert.equal(result, users, 'reference equality untuk mencegah loop di useEffect');
});

test('reconcileUserShipAssignments respects disabled status', () => {
  const ships = [{ id: 's1', name: 'MT MENGGALA', personnel: [] }];
  const users = [{ id: 'u10', role: 'PETUGAS', shipAssigned: 'MT MENGGALA', status: 'disabled' }];
  const result = reconcileUserShipAssignments(users, ships);
  assert.equal(result[0].shipAssigned, null);
  assert.equal(result[0].status, 'disabled', 'jangan reaktifkan user yang disabled');
});

test('shouldDeferPetugasFleetValidation waits for cloud fleet bootstrap before logout', () => {
  const result = shouldDeferPetugasFleetValidation({
    isCloudSyncEnabled: true,
    cloudSyncBootstrapped: false,
    isOffline: false,
    user: { id: 'u20', role: 'PETUGAS', shipAssigned: 'MT BARU', status: 'active' },
    assignedShip: null,
  });

  assert.equal(result, true, 'petugas approved jangan dilogout saat cache kapal belum bootstrap');
});

test('shouldDeferPetugasFleetValidation stops deferring after bootstrap or off-duty state', () => {
  assert.equal(shouldDeferPetugasFleetValidation({
    isCloudSyncEnabled: true,
    cloudSyncBootstrapped: true,
    isOffline: false,
    user: { id: 'u20', role: 'PETUGAS', shipAssigned: 'MT BARU', status: 'active' },
    assignedShip: null,
  }), false);

  assert.equal(shouldDeferPetugasFleetValidation({
    isCloudSyncEnabled: true,
    cloudSyncBootstrapped: false,
    isOffline: false,
    user: { id: 'u21', role: 'PETUGAS', shipAssigned: '', status: 'off-duty' },
    assignedShip: null,
  }), false);
});
