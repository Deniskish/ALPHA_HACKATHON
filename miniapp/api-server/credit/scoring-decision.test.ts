import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProviders } from './mock-providers';
import { applicationReadiness } from './readiness';
import { ScoringEngine, riskLevel, SCORING_WEIGHTS } from './scoring';
import { CreditDecisionEngine } from './decision';
import { monthlyPayment } from './finance';
import { creditProducts, syntheticCompanyRecords } from './synthetic-data';
import type { ApplicationDocument, Company, CreditApplication, DeclaredFinancials } from './types';

const now = new Date('2026-10-01T09:00:00Z');
const companies = new Map(syntheticCompanyRecords(now).map((c) => [c.inn, c]));
const doc = (type: ApplicationDocument['type']): ApplicationDocument => ({ id: type, applicationId: 'a', type, fileName: `${type}.pdf`,
  mimeType: 'application/pdf', sizeBytes: 1000, textCharacters: 500, uploadedAt: now.toISOString() });

function evaluate(company: Company, options: { productId?: string; purpose?: CreditApplication['purpose']; amount?: number; term?: number; declared?: DeclaredFinancials | null; documents?: ApplicationDocument[]; ml?: number } = {}) {
  const need = { ...company.demo!.need, ...(options.purpose ? { purpose: options.purpose } : {}) };
  const productId = options.productId ?? (need.purpose === 'EQUIPMENT' ? 'investment' : 'working-capital');
  const product = creditProducts.find((p) => p.id === productId)!;
  const application: CreditApplication = { id: 'a', number: 'CR-2026-00001', companyInn: company.inn, productId, state: 'DECISION',
    purpose: need.purpose, purposeDescription: 'Описание цели финансирования для теста', requestedAmount: options.amount ?? need.requestedAmount,
    requestedTermMonths: options.term ?? need.requestedTermMonths,
    declaredFinancials: options.declared === undefined ? company.financials && { revenue: company.financials.revenue, expenses: company.financials.expenses, currentDebt: company.financials.currentDebt } : options.declared,
    attempt: 1, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), submittedAt: now.toISOString(), acceptedOffer: null };
  const documents = options.documents ?? product.requiredDocuments.map(doc);
  const checks = defaultProviders().map((p) => ({ provider: p.provider, ...p.check({ company, application, documents, now }) }));
  const readiness = applicationReadiness(application, product, company, documents, now);
  const score = new ScoringEngine().score({ requestedAmount: application.requestedAmount!, registrationDate: company.registrationDate, checks, completeness: readiness.completeness, now });
  const decision = new CreditDecisionEngine().decide({ application, product, products: creditProducts, registrationDate: company.registrationDate,
    externalChecks: checks, scoringResult: score, readiness, documents, now,
    riskAssessment: options.ml === undefined ? null : { probability: options.ml, riskLevel: options.ml >= 0.2 ? 'HIGH' : 'LOW' } });
  return { score, decision };
}

test('scoring is deterministic, bounded and explains every factor', () => {
  const first = evaluate(companies.get('0001000010')!), second = evaluate(companies.get('0001000010')!);
  assert.deepEqual(first.score, second.score);
  assert.equal(Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(first.score.factors.map((f) => f.code), ['businessAge', 'paymentDiscipline', 'debtLoad', 'requestedAmountToRevenue', 'profitability', 'applicationCompleteness']);
  for (const factor of first.score.factors) {
    assert.ok(factor.impact >= 0 && factor.impact <= factor.maxImpact, factor.code);
    assert.ok(factor.title && factor.explanation);
  }
  assert.equal(first.score.score, first.score.factors.reduce((s, f) => s + f.impact, 0));
  assert.deepEqual([riskLevel(75), riskLevel(74), riskLevel(60), riskLevel(59)], ['LOW', 'MEDIUM', 'MEDIUM', 'HIGH']);
});

test('scenario A: stable company without overdue debt is APPROVED as requested', () => {
  const { score, decision } = evaluate(companies.get('0001000010')!);
  assert.ok(score.score >= 75, String(score.score)); assert.equal(score.riskLevel, 'LOW');
  assert.equal(decision.outcome, 'APPROVED');
  assert.deepEqual(decision.offer, { productId: 'working-capital', amount: 3_000_000, termMonths: 12, rate: 19.5, monthlyPayment: monthlyPayment(3_000_000, 19.5, 12),
    pricing: { keyRate: 16, productMargin: 3.5, riskPremium: 0 } });
  assert.ok(decision.reasons.some((r) => r.kind === 'positive' && /Просрочек .* нет/.test(r.text)));
});

test('scenario B: good company asking too much gets a COUNTER_OFFER with a lower amount and a longer term', () => {
  const { score, decision } = evaluate(companies.get('0002000020')!);
  assert.ok(score.score >= 75, String(score.score));
  assert.equal(decision.outcome, 'COUNTER_OFFER');
  assert.ok(decision.offer!.amount < 15_000_000 && decision.offer!.amount >= 1_000_000);
  assert.equal(decision.offer!.amount % 100_000, 0);
  assert.ok(decision.offer!.termMonths > 36 && decision.offer!.termMonths <= 60);
  assert.ok(decision.offer!.monthlyPayment <= 6_000_000 / 12 * 0.5, 'payment fits half of the monthly profit');
  assert.match(decision.summary, /вместо запрошенных 15\s000\s000\s₽/);
  assert.ok(decision.reasons.some((r) => r.code === 'AMOUNT_REDUCED') && decision.reasons.some((r) => r.code === 'TERM_CHANGED'));
});

test('scenario C: no financial data → NEEDS_INFO; numbers plus a statement → APPROVED on resubmission', () => {
  const c = companies.get('0003000030')!;
  const before = evaluate(c);
  assert.equal(before.decision.outcome, 'NEEDS_INFO'); assert.equal(before.score.dataComplete, false);
  assert.deepEqual(before.decision.requiredInfo.map((i) => i.code), ['DECLARED_FINANCIALS', 'FINANCIAL_STATEMENT']);
  const declared = { revenue: 18_000_000, expenses: 13_200_000, currentDebt: 500_000 };
  assert.deepEqual(evaluate(c, { declared }).decision.requiredInfo.map((i) => i.code), ['FINANCIAL_STATEMENT']);
  const after = evaluate(c, { declared, documents: [doc('BANK_STATEMENT'), doc('FINANCIAL_STATEMENT')] });
  assert.equal(after.score.dataComplete, true);
  assert.equal(after.decision.outcome, 'APPROVED', JSON.stringify(after.decision));
});

test('scenario D: critical overdue and high debt load → REJECTED with reasons', () => {
  const { score, decision } = evaluate(companies.get('0004000040')!);
  assert.equal(score.riskLevel, 'HIGH');
  assert.equal(decision.outcome, 'REJECTED'); assert.equal(decision.offer, null);
  assert.equal(decision.reasons[0].code, 'CRITICAL_OVERDUE');
  assert.ok(decision.reasons.some((r) => /Текущие долги/.test(r.text)));
  assert.match(decision.nextAction, /Погасите/);
});

test('decision rules: medium score gives a cautious counter offer, low score and losses reject', () => {
  const a = companies.get('0001000010')!;
  // A large amount relative to revenue on the express product lowers the score into the 60–74 band.
  const thin = { ...a, inn: '7707083893', source: 'manual' as const, isSynthetic: false, demo: a.demo };
  const medium = evaluate(thin, { productId: 'working-capital', amount: 9_000_000, term: 24,
    declared: { revenue: 30_000_000, expenses: 25_500_000, currentDebt: 10_000_000 }, documents: [doc('BANK_STATEMENT'), doc('FINANCIAL_STATEMENT'), doc('REGISTRY_EXTRACT')] });
  assert.ok(medium.score.score >= 60 && medium.score.score < 75, String(medium.score.score));
  assert.equal(medium.decision.outcome, 'COUNTER_OFFER');
  assert.ok(medium.decision.offer!.amount <= 9_000_000 * 0.8); assert.equal(medium.decision.offer!.rate, 21.5);
  const loss = evaluate(thin, { declared: { revenue: 10_000_000, expenses: 11_000_000, currentDebt: 0 },
    documents: [doc('BANK_STATEMENT'), doc('FINANCIAL_STATEMENT'), doc('REGISTRY_EXTRACT')] });
  assert.equal(loss.decision.outcome, 'REJECTED'); assert.equal(loss.decision.reasons[0].code, 'NO_PROFIT');
  const unknownRegistry = evaluate(thin, { declared: { revenue: 30_000_000, expenses: 20_000_000, currentDebt: 0 }, documents: [doc('BANK_STATEMENT'), doc('FINANCIAL_STATEMENT')] });
  assert.deepEqual(unknownRegistry.decision.requiredInfo.map((i) => i.code), ['REGISTRY_EXTRACT']);
});

test('counter offer switches the product when the own product minimum is not affordable', () => {
  const a = companies.get('0001000010')!;
  const small = { ...a, inn: '7707083893', source: 'manual' as const, isSynthetic: false };
  // Investment minimum is 1 000 000 ₽; a small profitable business can only service a smaller express loan.
  const result = evaluate(small, { productId: 'investment', purpose: 'EQUIPMENT', amount: 1_500_000, term: 12,
    declared: { revenue: 2_400_000, expenses: 1_800_000, currentDebt: 0 }, documents: [doc('BANK_STATEMENT'), doc('INVESTMENT_PLAN'), doc('FINANCIAL_STATEMENT'), doc('REGISTRY_EXTRACT')] });
  assert.equal(result.decision.outcome, 'COUNTER_OFFER', JSON.stringify(result.decision));
  // Investment minimum is not affordable; the best affordable alternative for this purpose is equipment financing.
  assert.equal(result.decision.offer!.productId, 'equipment');
  assert.ok(result.decision.offer!.amount >= 300_000 && result.decision.offer!.amount < 1_000_000 && result.decision.offer!.termMonths <= 48);
  assert.ok(result.decision.reasons.some((r) => r.code === 'PRODUCT_CHANGED'));
});

test('ML risk is one input: high probability makes terms cautious, low probability never overrides a hard stop', () => {
  const a = companies.get('0001000010')!, d = companies.get('0004000040')!;
  const plain = evaluate(a), lowMl = evaluate(a, { ml: 0.01 }), highMl = evaluate(a, { ml: 0.35 });
  assert.equal(plain.decision.outcome, 'APPROVED');
  assert.deepEqual(lowMl.decision.offer, plain.decision.offer, 'a low ML estimate changes nothing');
  assert.ok(highMl.decision.reasons.some((r) => r.code === 'ML_RISK_CAUTION'));
  assert.ok(highMl.decision.offer!.rate > plain.decision.offer!.rate, 'risk premium applied');
  assert.equal(highMl.decision.offer!.pricing!.riskPremium, 2);
  assert.equal(evaluate(d, { ml: 0.01 }).decision.outcome, 'REJECTED', 'ML cannot approve what the rules reject');
});
