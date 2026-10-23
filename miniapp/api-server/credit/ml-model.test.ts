import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import exported from './model/risk-model.json';
import { encodeFeatures, LightGbmRiskModel, shapValues, type ExportedRiskModel } from './ml-model';
import type { RiskFeatures } from './features';

const model = exported as unknown as ExportedRiskModel;
const fixtures = JSON.parse(readFileSync(path.join(__dirname, 'model/risk-model.fixtures.json'), 'utf8')) as
  { version: string; rows: { features: Record<string, unknown>; probability: number; contributions: number[] }[] };
const riskModel = new LightGbmRiskModel();

test('exported model reproduces LightGBM probabilities and SHAP contributions (ml/train.py fixtures)', () => {
  assert.equal(fixtures.version, model.version);
  assert.ok(fixtures.rows.length >= 20);
  for (const row of fixtures.rows) {
    const features = row.features as unknown as RiskFeatures;
    assert.ok(Math.abs(riskModel.probability(features) - row.probability) < 1e-4, `probability ${row.probability}`);
    const shap = shapValues(model, encodeFeatures(model, features));
    assert.equal(shap.length, row.contributions.length);
    shap.forEach((value, i) => assert.ok(Math.abs(value - row.contributions[i]) < 1e-9, `${model.columns[i] ?? 'base'}: ${value} vs ${row.contributions[i]}`));
    // Local accuracy: contributions plus the base value add up to the raw score.
    const raw = shap.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(1 / (1 + Math.exp(-raw)) - riskModel.probability(features)) < 1e-6);
  }
});

const base: RiskFeatures = {
  businessAgeMonths: 60, legalForm: 'OOO', industry: 'manufacturing', region: 'large', employees: 20,
  annualRevenue: 40_000_000, annualExpenses: 34_000_000, annualProfit: 6_000_000, profitMargin: 0.15, monthlyCashflow: 500_000,
  currentDebt: 4_000_000, debtToRevenue: 0.1, activeLoans: 1, latePayments12m: 0, maxOverdueDays: 0, overdueAmount: 0, overdueToRevenue: 0,
  requestedAmount: 3_000_000, requestedTermMonths: 24, purpose: 'WORKING_CAPITAL', amountToRevenue: 0.075, estimatedPayment: 152_000,
  paymentToProfit: 0.3, keyRate: 16,
};

test('risk grows with overdue history and payment burden (monotone constraints)', () => {
  const p = (patch: Partial<RiskFeatures>) => riskModel.probability({ ...base, ...patch });
  assert.ok(p({ latePayments12m: 3, maxOverdueDays: 45 }) > p({}));
  assert.ok(p({ paymentToProfit: 1.5 }) > p({ paymentToProfit: 0.3 }));
  assert.ok(p({ debtToRevenue: 0.8 }) > p({}));
  assert.ok(p({ businessAgeMonths: 8 }) >= p({ businessAgeMonths: 120 }));
});

test('assessment returns probability, risk level and plain-language top factors', () => {
  const good = riskModel.assess(base);
  assert.equal(good.modelVersion, model.version);
  assert.equal(good.riskLevel, 'LOW');
  assert.ok(good.topFactors.length > 0 && good.topFactors.length <= 4);
  const bad = riskModel.assess({ ...base, latePayments12m: 5, maxOverdueDays: 90, overdueAmount: 2_000_000, overdueToRevenue: 0.05,
    debtToRevenue: 0.9, profitMargin: 0.02, annualProfit: 800_000, paymentToProfit: 2.3 });
  assert.equal(bad.riskLevel, 'HIGH');
  assert.ok(bad.topFactors.every((f) => f.text.length > 10 && !/undefined|NaN/.test(f.text)));
  assert.ok(bad.topFactors.some((f) => f.impact === 'negative' && /Просрочки|просрочка|Платёж|рентабельность|Долги/.test(f.text)), JSON.stringify(bad.topFactors));
  assert.throws(() => riskModel.assess({ ...base, annualRevenue: Number.NaN }), /RISK_FEATURE_INVALID/);
});
