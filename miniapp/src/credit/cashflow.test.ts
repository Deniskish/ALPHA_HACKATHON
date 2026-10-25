import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCashFlowProjection } from './cashflow';

test('cashflow projection calculates 12 months with valid structure', () => {
  const scenario = calculateCashFlowProjection({
    annualRevenue: 24_000_000,
    annualExpenses: 18_000_000,
    newLoanAmount: 3_000_000,
    newLoanRate: 19.5,
    newLoanTermMonths: 24,
    revenueStressPercent: 0,
  });

  assert.equal(scenario.months.length, 12);
  assert.equal(scenario.safetyZone, 'GREEN');
  assert.ok(scenario.averageDscr > 1.30, `Expected DSCR > 1.3, got ${scenario.averageDscr}`);
  assert.ok(scenario.breakEvenMonthlyRevenue > 0);
  assert.equal(scenario.months[0].monthName, 'Янв');
});

test('cashflow stress test decreases DSCR and identifies risk zone under 30% shock', () => {
  const base = calculateCashFlowProjection({
    annualRevenue: 12_000_000,
    annualExpenses: 10_000_000,
    newLoanAmount: 4_000_000,
    newLoanRate: 20.0,
    newLoanTermMonths: 12,
    revenueStressPercent: 0,
  });

  const stressed = calculateCashFlowProjection({
    annualRevenue: 12_000_000,
    annualExpenses: 10_000_000,
    newLoanAmount: 4_000_000,
    newLoanRate: 20.0,
    newLoanTermMonths: 12,
    revenueStressPercent: 30, // 30% drop in revenue
  });

  assert.ok(stressed.averageDscr < base.averageDscr, 'Stressed DSCR must be lower than base');
  assert.ok(stressed.minCumulativeCash < base.minCumulativeCash, 'Stressed cash balance must decrease');
  assert.equal(stressed.safetyZone, 'RED');
});
