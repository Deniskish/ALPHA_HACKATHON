import test from 'node:test';
import assert from 'node:assert/strict';
import { CALIBRATION_DECILES, DEMO_WATERFALLS } from './ModelGovernance';

test('CALIBRATION_DECILES contains 10 well-calibrated decile records', () => {
  assert.equal(CALIBRATION_DECILES.length, 10);
  for (let i = 0; i < CALIBRATION_DECILES.length; i++) {
    const pt = CALIBRATION_DECILES[i];
    assert.equal(pt.decile, i + 1);
    assert.ok(pt.predicted >= 0 && pt.predicted <= 1);
    assert.ok(pt.observed >= 0 && pt.observed <= 1);
    // Predicted and observed must track closely
    const diff = Math.abs(pt.predicted - pt.observed);
    assert.ok(diff < 0.03, `Decile ${pt.decile} divergence too high: ${diff}`);
  }
});

test('DEMO_WATERFALLS provides valid factor cascades for company A, B, and D', () => {
  assert.ok(DEMO_WATERFALLS.A);
  assert.ok(DEMO_WATERFALLS.B);
  assert.ok(DEMO_WATERFALLS.D);

  // A has low risk
  assert.ok(DEMO_WATERFALLS.A.finalProb < 0.05);
  // D has critical risk
  assert.ok(DEMO_WATERFALLS.D.finalProb > 0.90);
  // Each must have explanatory factors
  assert.ok(DEMO_WATERFALLS.A.factors.length >= 3);
});
