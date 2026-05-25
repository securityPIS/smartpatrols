import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCESS_ROLES,
  computeOperationalAccessEnabled,
  normalizeOperationalStatus,
} from '../../src/services/backend/accessModels.js';

test('PIC dan ADMIN tetap enabled tanpa assignment kapal langsung', () => {
  assert.equal(computeOperationalAccessEnabled({
    role: ACCESS_ROLES.ADMIN,
    status: 'active',
    shipAssigned: '',
  }), true);

  assert.equal(computeOperationalAccessEnabled({
    role: ACCESS_ROLES.PIC,
    status: 'active',
    shipAssigned: '',
  }), true);
});

test('PETUGAS harus active dan punya kapal untuk akses operasional', () => {
  assert.equal(computeOperationalAccessEnabled({
    role: ACCESS_ROLES.PETUGAS,
    status: 'active',
    shipAssigned: 'MT TEST',
  }), true);

  assert.equal(computeOperationalAccessEnabled({
    role: ACCESS_ROLES.PETUGAS,
    status: 'active',
    shipAssigned: '',
  }), false);

  assert.equal(normalizeOperationalStatus('active', ACCESS_ROLES.PETUGAS, ''), 'off-duty');
});
