import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCESS_ROLES,
  buildOperationalAccessPayload,
  buildPendingRegistrationPayload,
} from '../../src/services/backend/accessModels.js';

test('pending registration payload tetap membuang field sensitif dan approval field liar', () => {
  const payload = buildPendingRegistrationPayload({
    uid: 'uid-public-1',
    email: 'PUBLIC@EXAMPLE.COM',
    name: '  Petugas Baru  ',
    phone: '0812-3456-7890',
    role: ACCESS_ROLES.ADMIN,
    shipAssigned: 'MT MENGGALA',
    status: 'pending',
    reviewNote: 'should-not-stick',
  });

  assert.equal(payload.uid, 'uid-public-1');
  assert.equal(payload.email, 'public@example.com');
  assert.equal(payload.name, 'Petugas Baru');
  assert.equal(payload.phone, '081234567890');
  assert.equal(payload.status, 'pending');
  assert.equal(payload.reviewNote, 'should-not-stick');
  assert.equal(Object.hasOwn(payload, 'role'), false);
  assert.equal(Object.hasOwn(payload, 'shipAssigned'), false);
});

test('akses petugas off-duty tanpa assignment tidak langsung enabled', () => {
  const payload = buildOperationalAccessPayload({
    uid: 'uid-guard-1',
    email: 'guard@example.com',
    name: 'Guard One',
    role: ACCESS_ROLES.PETUGAS,
    status: 'off-duty',
    shipAssigned: '',
  });

  assert.equal(payload.role, ACCESS_ROLES.PETUGAS);
  assert.equal(payload.status, 'off-duty');
  assert.equal(payload.shipAssigned, null);
  assert.equal(payload.enabled, false);
});

test('admin operasional selalu enabled saat review approved', () => {
  const payload = buildOperationalAccessPayload({
    uid: 'uid-admin-1',
    email: 'admin@smartpatrol.local',
    name: 'Admin One',
    role: ACCESS_ROLES.ADMIN,
    status: 'active',
  });

  assert.equal(payload.role, ACCESS_ROLES.ADMIN);
  assert.equal(payload.enabled, true);
  assert.equal(payload.reviewState, 'approved');
});
