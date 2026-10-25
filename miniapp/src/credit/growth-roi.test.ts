import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOpportunityRoi } from './GrowthRoiCalculator';

test('calculateOpportunityRoi proves positive economic benefit of financing vs accumulation', () => {
  const roi = calculateOpportunityRoi({
    requestedAmount: 4_000_000,
    termMonths: 36,
    rate: 17.5,
    monthlyBusinessSavings: 150_000,
    projectAnnualYieldShare: 0.45,
  });

  assert.equal(roi.requestedAmount, 4_000_000);
  assert.equal(roi.termMonths, 36);
  assert.ok(roi.totalInterest > 0);
  assert.ok(roi.lostProfitDuringWait > roi.totalInterest, 'Lost profit while accumulating must exceed interest expense');
  assert.ok(roi.netEconomicBenefit > 0, 'Net economic benefit of timely financing must be positive');
  assert.ok(roi.roiPercent > 0);
});
