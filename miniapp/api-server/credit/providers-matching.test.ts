import test from 'node:test';
import assert from 'node:assert/strict';
import { BKIMockProvider, FNSMockProvider, FinancialDataMockProvider, type CheckInput } from './mock-providers';
import { matchProducts } from './matching';
import { applicationReadiness } from './readiness';
import { affordablePrincipal, businessAgeMonths, formatRub, monthlyPayment } from './finance';
import { creditProducts, syntheticCompanyRecords } from './synthetic-data';
import type { ApplicationDocument, Company, CreditApplication } from './types';
import { validInn } from '../company-data/inn';

const now = new Date('2026-10-01T09:00:00Z');
const companies = new Map(syntheticCompanyRecords(now).map((c) => [c.inn, c]));
const manual: Company = { inn: '7707083893', name: 'ООО «Ручной ввод»', legalForm: 'ООО', registrationDate: '2018-01-15', okved: '62.01',
  okvedTitle: null, region: 'Москва', employees: 5, financials: null, source: 'manual', isSynthetic: false, demo: null, updatedAt: now.toISOString() };
const app = (patch: Partial<CreditApplication> = {}): CreditApplication => ({ id: 'a', number: 'CR-2026-00001', companyInn: '0001000010',
  productId: 'working-capital', state: 'DATA_COLLECTION', purpose: 'WORKING_CAPITAL', purposeDescription: 'Закупка муки и сахара на сезон',
  requestedAmount: 3_000_000, requestedTermMonths: 12, declaredFinancials: null, attempt: 1, version: 1, createdAt: now.toISOString(),
  updatedAt: now.toISOString(), submittedAt: null, acceptedOffer: null, ...patch });
const doc = (type: ApplicationDocument['type']): ApplicationDocument => ({ id: type, applicationId: 'a', type, fileName: `${type}.pdf`,
  mimeType: 'application/pdf', sizeBytes: 1000, textCharacters: 500, uploadedAt: now.toISOString() });
const input = (company: Company, patch: Partial<CreditApplication> = {}, documents: ApplicationDocument[] = []): CheckInput =>
  ({ company, application: app({ companyInn: company.inn, ...patch }), documents, now });

test('synthetic INNs are valid but use the unassigned region 00; every scenario is present', () => {
  for (const company of companies.values()) { assert.ok(validInn(company.inn)); assert.match(company.inn, /^00/); assert.match(company.name, /Демо/); }
  assert.deepEqual([...companies.values()].map((c) => [c.demo?.scenario, c.relationship]), [['APPROVED', 'client'], ['COUNTER_OFFER', 'client'],
    ['NEEDS_INFO', 'client'], ['REJECTED', 'client'], ['APPROVED', 'non_client'], ['COUNTER_OFFER', 'non_client']]);
  for (const company of companies.values()) assert.equal(!!company.bankProfile, company.relationship === 'client');
  assert.equal(companies.get('0005000050')!.financials, null, 'the bank does not know figures of a non-client');
});

test('mock providers answer from the synthetic dataset without network access', () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('network is not allowed'); }) as typeof fetch;
  try {
    const a = companies.get('0001000010')!, d = companies.get('0004000040')!;
    assert.deepEqual(new FNSMockProvider().check(input(a)).payload, { active: true, registrationDate: '2019-03-14', okved: '10.71', source: 'synthetic-registry' });
    assert.equal(new BKIMockProvider().check(input(d)).payload?.maxDaysOverdue, 97);
    assert.equal(new FinancialDataMockProvider().check(input(a)).payload?.revenue, 48_000_000);
  } finally { globalThis.fetch = realFetch; }
});

test('missing source data becomes NOT_FOUND until the applicant attaches a document', () => {
  const c = companies.get('0003000030')!, finance = new FinancialDataMockProvider(), fns = new FNSMockProvider();
  assert.deepEqual(finance.check(input(c)), { status: 'NOT_FOUND', payload: null });
  const declared = { revenue: 18_000_000, expenses: 13_200_000, currentDebt: 500_000 };
  assert.equal(finance.check(input(c, { declaredFinancials: declared })).status, 'NOT_FOUND', 'numbers alone are not enough');
  const based = finance.check(input(c, { declaredFinancials: declared }, [doc('FINANCIAL_STATEMENT')]));
  assert.equal(based.status, 'DOCUMENT_BASED'); assert.equal(based.payload?.profit, 4_800_000); assert.equal(based.payload?.period, 2025);
  assert.equal(fns.check(input(manual)).status, 'NOT_FOUND');
  assert.equal(fns.check(input(manual, {}, [doc('REGISTRY_EXTRACT')])).status, 'DOCUMENT_BASED');
  assert.equal(fns.check(input({ ...manual, source: 'registry' })).status, 'OK');
  assert.deepEqual(new BKIMockProvider().check(input(manual)).status, 'NO_HISTORY');
});

test('product matching explains fit and recommends the cheapest eligible product', () => {
  const a = companies.get('0001000010')!;
  const matches = matchProducts(creditProducts, a, { purpose: 'WORKING_CAPITAL', requestedAmount: 3_000_000, requestedTermMonths: 12 }, now);
  assert.deepEqual(matches.filter((m) => m.eligible).map((m) => [m.product.id, m.recommended]), [['working-capital', true], ['express', false]]);
  assert.equal(matches.length, 6);
  assert.deepEqual(matches[0].pricing, { keyRate: 16, productMargin: 3.5, riskPremium: 0, rate: 19.5 });
  assert.ok(matches[0].checks.every((c) => c.ok)); assert.equal(matches[0].estimatedMonthlyPayment, monthlyPayment(3_000_000, 19.5, 12));
  const investment = matches.find((m) => m.product.id === 'investment')!;
  assert.match(investment.checks.find((c) => c.code === 'purpose')!.text, /не финансируется/);
  const young = matchProducts(creditProducts, { registrationDate: '2026-01-10' }, { purpose: 'EQUIPMENT', requestedAmount: 2_000_000, requestedTermMonths: 12 }, now);
  assert.deepEqual(young.filter((m) => m.eligible).map((m) => m.product.id), ['young-business', 'express'], 'young business product is cheaper than express');
  assert.match(young.find((m) => m.product.id === 'equipment')!.checks.find((c) => c.code === 'businessAge')!.text, /нужно от 1 год/);
  assert.match(young.find((m) => m.product.id === 'investment')!.checks.find((c) => c.code === 'businessAge')!.text, /нужно от 2 года/);
  assert.ok(matchProducts(creditProducts, a, { purpose: 'OTHER', requestedAmount: 50_000_000, requestedTermMonths: 12 }, now).every((m) => !m.eligible));
});

test('readiness requires product limits, description and product documents; financial data stays optional', () => {
  const a = companies.get('0001000010')!, product = creditProducts[0];
  let readiness = applicationReadiness(app(), product, a, [], now);
  assert.equal(readiness.ready, false); assert.deepEqual(readiness.missing.map((i) => i.code), ['document:BANK_STATEMENT']);
  readiness = applicationReadiness(app(), product, a, [doc('BANK_STATEMENT')], now);
  assert.equal(readiness.ready, true); assert.ok(readiness.completeness < 1);
  readiness = applicationReadiness(app({ purposeDescription: 'коротко', requestedAmount: 99_000_000 }), product, a, [doc('BANK_STATEMENT')], now);
  assert.deepEqual(readiness.missing.map((i) => i.code), ['amount', 'purposeDescription']);
  assert.deepEqual(applicationReadiness(app({ productId: null }), null, a, [], now).missing.map((i) => i.code), ['product']);
  readiness = applicationReadiness(app({ declaredFinancials: { revenue: 1, expenses: 1, currentDebt: 0, activeLoans: 0 }, declaredCreditHistory: { hadOverdue12m: false, maxOverdueDays: 0 } }),
    product, a, [doc('BANK_STATEMENT'), doc('FINANCIAL_STATEMENT')], now);
  assert.equal(readiness.completeness, 1);
});

test('loan arithmetic is deterministic', () => {
  assert.equal(monthlyPayment(1_200_000, 0, 12), 100_000);
  assert.equal(monthlyPayment(3_000_000, 19.5, 12), 277_186);
  assert.ok(Math.abs(affordablePrincipal(monthlyPayment(5_000_000, 17.5, 36), 17.5, 36) - 5_000_000) < 50);
  assert.equal(businessAgeMonths('2019-03-14', now), 90); assert.equal(businessAgeMonths('2030-01-01', now), null);
  assert.equal(formatRub(2_500_000), '2\u00a0500\u00a0000\u00a0₽');
});
