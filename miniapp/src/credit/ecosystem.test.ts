import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCounterpartyEcosystem } from './ecosystem';

test('analyzeCounterpartyEcosystem calculates valid Alfa share and boost for bakery A', () => {
  const analysis = analyzeCounterpartyEcosystem('0001000010', 48_000_000);

  assert.ok(analysis.nodes.length >= 3);
  assert.ok(analysis.alfaVolumeShare >= 0.65, `Expected Alfa share >= 0.65, got ${analysis.alfaVolumeShare}`);
  assert.equal(analysis.trustLevel, 'HIGH_ECOSYSTEM');
  assert.equal(analysis.ecosystemBoostPoints, 12);
  assert.equal(analysis.rateDiscountPercent, 1.5);
  assert.match(analysis.rationale, /замкнуто на надёжных клиентов Альфа-Банка/);
});

test('analyzeCounterpartyEcosystem handles generic company with moderate or standalone boost', () => {
  const analysis = analyzeCounterpartyEcosystem('9999999999', 10_000_000);

  assert.ok(analysis.nodes.length > 0);
  assert.ok(analysis.ecosystemBoostPoints >= 2);
  assert.ok(analysis.totalConnectedVolume > 0);
});
