import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateClockDriftMs,
  DEFAULT_CLOCK_TAMPER_DRIFT_THRESHOLD_MS,
  isClockDriftSuspicious,
} from '../../src/services/time/trustedTimePolicy.js';

test('clock drift dihitung absolut untuk audit tamper', () => {
  assert.equal(calculateClockDriftMs(12_000, 11_000), 1_000);
  assert.equal(calculateClockDriftMs(9_000, 12_500), 3_500);
});

test('trusted time hanya menandai drift di atas threshold', () => {
  assert.equal(
    isClockDriftSuspicious(10_000, 10_000 + DEFAULT_CLOCK_TAMPER_DRIFT_THRESHOLD_MS),
    false,
  );
  assert.equal(
    isClockDriftSuspicious(10_000, 10_000 + DEFAULT_CLOCK_TAMPER_DRIFT_THRESHOLD_MS + 1),
    true,
  );
});
