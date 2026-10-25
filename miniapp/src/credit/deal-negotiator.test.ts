import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateParetoDeal, PARETO_LEVERS } from './DealNegotiator';

test('calculateParetoDeal calculates baseline offer terms correctly', () => {
  const deal = calculateParetoDeal({
    baseAmount: 9_900_000,
    requestedAmount: 15_000_000,
    baseTermMonths: 60,
    baseRate: 17.5,
    monthlyProfit: 500_000,
    selectedAmount: 9_900_000,
    selectedTermMonths: 60,
    activeLevers: [],
  });

  assert.equal(deal.amount, 9_900_000);
  assert.equal(deal.termMonths, 60);
  assert.equal(deal.rate, 17.5);
  assert.ok(deal.payment > 0);
  assert.ok(deal.approvalProbability >= 80, `Expected approval >= 80%, got ${deal.approvalProbability}`);
});

test('calculateParetoDeal increases approval probability and lowers rate when levers are applied', () => {
  const base = calculateParetoDeal({
    baseAmount: 9_900_000,
    requestedAmount: 15_000_000,
    baseTermMonths: 60,
    baseRate: 17.5,
    monthlyProfit: 500_000,
    selectedAmount: 12_000_000, // higher amount requested
    selectedTermMonths: 60,
    activeLevers: [],
  });

  const boosted = calculateParetoDeal({
    baseAmount: 9_900_000,
    requestedAmount: 15_000_000,
    baseTermMonths: 60,
    baseRate: 17.5,
    monthlyProfit: 500_000,
    selectedAmount: 12_000_000,
    selectedTermMonths: 60,
    activeLevers: ['director_guarantee', 'equipment_pledge'],
  });

  assert.ok(boosted.rate < base.rate, 'Rate must be discounted with equipment pledge');
  assert.ok(boosted.approvalProbability > base.approvalProbability, 'Levers must increase approval probability');
});
