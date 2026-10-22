import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app';
import { ApplicationService } from './service';
import { CreditStore } from './store';

type Json = any;
async function api(run: (call: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Json }>) => Promise<void>) {
  const credit = new ApplicationService(new CreditStore(), { now: () => new Date('2026-10-01T09:00:00Z') });
  const server = createApp({ env: {}, credit }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as { port: number };
  try {
    await run(async (method, path, body) => {
      const response = await fetch(`http://127.0.0.1:${port}/api${path}`, { method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    });
  } finally { await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }); credit.store.close(); }
}
const description = 'Закупка сырья и материалов для выполнения сезонных заказов';
const doc = (type: string) => ({ type, fileName: `${type.toLowerCase()}.pdf`, mimeType: 'application/pdf', sizeBytes: 120_000, textCharacters: 4000 });

/** Client journey for a demo company up to the decision. */
async function journey(call: Parameters<Parameters<typeof api>[0]>[0], inn: string) {
  const { body: { companies } } = await call('GET', '/demo/companies');
  const company = companies.find((c: Json) => c.inn === inn), need = company.demo.need;
  const { body: products } = await call('GET', `/credit/products?inn=${inn}&purpose=${need.purpose}&amount=${need.requestedAmount}&term=${need.requestedTermMonths}`);
  const product = products.matches.find((m: Json) => m.recommended).product;
  const created = await call('POST', '/applications', { companyInn: inn, ...need, productId: product.id, purposeDescription: description });
  assert.equal(created.status, 201);
  let view = created.body;
  for (const type of product.requiredDocuments) view = (await call('POST', `/applications/${view.application.id}/documents`, doc(type))).body;
  assert.equal(view.application.state, 'READY_TO_SUBMIT', JSON.stringify(view.readiness.missing));
  const submitted = await call('POST', `/applications/${view.application.id}/submit`);
  assert.equal(submitted.body.application.state, 'SUBMITTED');
  const processed = await call('POST', `/applications/${view.application.id}/process`);
  assert.equal(processed.status, 200);
  return processed.body;
}

test('health, products and synthetic demo companies are available without external services', () => api(async (call) => {
  const health = await call('GET', '/health');
  assert.equal(health.status, 200); assert.deepEqual(health.body.credit, { products: 3, demoCompanies: 4, storage: 'sqlite' });
  const products = await call('GET', '/credit/products');
  assert.equal(products.body.products.length, 3); assert.equal(products.body.syntheticLabel, 'Синтетические демонстрационные данные');
  const demo = await call('GET', '/demo/companies');
  assert.deepEqual(demo.body.companies.map((c: Json) => c.demo.scenario), ['APPROVED', 'COUNTER_OFFER', 'NEEDS_INFO', 'REJECTED']);
  assert.ok(demo.body.companies.every((c: Json) => c.syntheticLabel === 'Синтетические демонстрационные данные'));
  assert.equal((await call('GET', '/companies/0001000010')).body.company.name, 'ООО «Демо Хлебозавод»');
  assert.equal((await call('GET', '/companies/7707083893')).status, 404);
  assert.equal((await call('GET', '/companies/123')).body.code, 'VALIDATION_ERROR');
}));

test('create, update and document upload move DRAFT → DATA_COLLECTION → READY_TO_SUBMIT with events', () => api(async (call) => {
  const created = await call('POST', '/applications', { companyInn: '0001000010' });
  assert.equal(created.status, 201); assert.equal(created.body.application.state, 'DRAFT');
  assert.equal(created.body.application.declaredFinancials.revenue, 48_000_000, 'prefilled from company data');
  const id = created.body.application.id;
  let view = (await call('PATCH', `/applications/${id}`, { productId: 'working-capital', purpose: 'WORKING_CAPITAL', requestedAmount: 3_000_000,
    requestedTermMonths: 12, purposeDescription: description })).body;
  assert.equal(view.application.state, 'DATA_COLLECTION');
  assert.deepEqual(view.readiness.missing.map((m: Json) => m.code), ['document:BANK_STATEMENT']);
  view = (await call('POST', `/applications/${id}/documents`, doc('BANK_STATEMENT'))).body;
  assert.equal(view.application.state, 'READY_TO_SUBMIT');
  view = (await call('PATCH', `/applications/${id}`, { requestedAmount: 50_000_000 })).body;
  assert.equal(view.application.state, 'DATA_COLLECTION', 'amount above product max makes it incomplete again');
  view = (await call('PATCH', `/applications/${id}`, { requestedAmount: 3_000_000, version: view.application.version })).body;
  assert.equal(view.application.state, 'READY_TO_SUBMIT');
  const conflict = await call('PATCH', `/applications/${id}`, { requestedAmount: 2_000_000, version: 1 });
  assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'VERSION_CONFLICT');
  const events = (await call('GET', `/applications/${id}/events`)).body.events;
  assert.deepEqual(events.filter((e: Json) => e.type === 'STATE_CHANGED').map((e: Json) => e.toState),
    ['DATA_COLLECTION', 'READY_TO_SUBMIT', 'DATA_COLLECTION', 'READY_TO_SUBMIT']);
  assert.deepEqual(events.map((e: Json) => e.sequence), events.map((_: Json, i: number) => i + 1));
  const list = (await call('GET', '/applications?inn=0001000010')).body.applications;
  assert.equal(list.length, 1); assert.equal(list[0].state, 'READY_TO_SUBMIT');
}));

test('input validation returns readable 400 errors', () => api(async (call) => {
  for (const [body, field] of [
    [{ companyInn: '123' }, 'companyInn'],
    [{ companyInn: '0001000010', requestedAmount: -5 }, 'requestedAmount'],
    [{ companyInn: '0001000010', requestedTermMonths: 1.5 }, 'requestedTermMonths'],
    [{ companyInn: '0001000010', purpose: 'GRANT' }, 'purpose'],
    [{ companyInn: '0001000010', hacked: true }, 'hacked'],
    [{ companyInn: '7707083893', company: { inn: '7707083893', name: 'X', registrationDate: '2020-01-01', okved: '62.01', region: 'Москва' } }, 'company.name'],
    [{ companyInn: '7707083893', company: { inn: '7707083893', name: 'ООО Тест', registrationDate: '2999-01-01', okved: '62.01', region: 'Москва' } }, 'company.registrationDate'],
  ] as const) {
    const response = await call('POST', '/applications', body);
    assert.equal(response.status, 400, JSON.stringify(body)); assert.equal(response.body.code, 'VALIDATION_ERROR');
    assert.equal(response.body.details.field, field); assert.ok(response.body.error);
  }
  assert.equal((await call('POST', '/applications', { companyInn: '7707083893' })).body.code, 'COMPANY_NOT_FOUND');
  const id = (await call('POST', '/applications', { companyInn: '0001000010' })).body.application.id;
  assert.equal((await call('PATCH', `/applications/${id}`, { productId: 'mortgage' })).body.code, 'VALIDATION_ERROR');
  assert.equal((await call('POST', `/applications/${id}/documents`, { ...doc('PASSPORT') })).body.details.field, 'type');
  assert.equal((await call('GET', '/applications/missing')).status, 404);
}));

test('invalid transitions are refused and leave the application unchanged', () => api(async (call) => {
  const id = (await call('POST', '/applications', { companyInn: '0001000010' })).body.application.id;
  const early = await call('POST', `/applications/${id}/submit`);
  assert.equal(early.status, 422); assert.equal(early.body.code, 'APPLICATION_INCOMPLETE'); assert.ok(early.body.details.missing.length);
  assert.equal((await call('POST', `/applications/${id}/process`)).body.code, 'INVALID_STATE');
  assert.equal((await call('POST', `/applications/${id}/accept`)).body.code, 'INVALID_TRANSITION');
  assert.equal((await call('POST', `/applications/${id}/sign`)).body.code, 'INVALID_TRANSITION');
  assert.equal((await call('GET', `/applications/${id}/decision`)).status, 404);
  assert.equal((await call('GET', `/applications/${id}/scoring`)).body.code, 'SCORING_NOT_READY');
  assert.equal((await call('GET', `/applications/${id}`)).body.application.state, 'DRAFT');
}));

test('E2E A: APPROVED → offer accepted → signing simulated → COMPLETED', () => api(async (call) => {
  const result = await journey(call, '0001000010');
  const id = result.application.id;
  assert.equal(result.application.state, 'APPROVED'); assert.equal(result.decision.offer.amount, 3_000_000);
  assert.deepEqual(result.timeline.filter((e: Json) => e.type === 'STATE_CHANGED').map((e: Json) => e.message).slice(-6),
    ['Заявка отправлена', 'Проверяем данные компании', 'Получаем сведения', 'Оцениваем заявку', 'Формируем решение', 'Заявка одобрена']);
  const scoring = (await call('GET', `/applications/${id}/scoring`)).body;
  assert.ok(scoring.score >= 75); assert.equal(scoring.factors.length, 6);
  assert.equal((await call('GET', `/applications/${id}/decision`)).body.outcome, 'APPROVED');
  assert.equal((await call('PATCH', `/applications/${id}`, { requestedAmount: 1_000_000 })).body.code, 'APPLICATION_LOCKED');
  const accepted = (await call('POST', `/applications/${id}/accept`)).body;
  assert.equal(accepted.application.state, 'OFFER_ACCEPTED'); assert.equal(accepted.application.acceptedOffer.amount, 3_000_000);
  assert.equal((await call('POST', `/applications/${id}/sign`)).body.application.state, 'COMPLETED');
  const bank = (await call('GET', `/bank/applications/${id}`)).body;
  assert.deepEqual(bank.checks.map((c: Json) => [c.provider, c.status]), [['FNS', 'OK'], ['BKI', 'OK'], ['FINANCE', 'OK']]);
  assert.equal(bank.scoring.score, scoring.score);
  assert.deepEqual(bank.events.filter((e: Json) => e.type === 'STATE_CHANGED').map((e: Json) => e.toState),
    ['DATA_COLLECTION', 'READY_TO_SUBMIT', 'SUBMITTED', 'VALIDATING', 'ENRICHING', 'SCORING', 'DECISION', 'APPROVED', 'OFFER_ACCEPTED', 'COMPLETED']);
}));

test('E2E B: COUNTER_OFFER changes amount and term; accepting it stores the offered terms', () => api(async (call) => {
  const result = await journey(call, '0002000020');
  assert.equal(result.application.state, 'COUNTER_OFFER');
  assert.ok(result.decision.offer.amount < 15_000_000); assert.ok(result.decision.offer.termMonths > 36);
  assert.match(result.decision.summary, /вместо запрошенных/);
  const accepted = (await call('POST', `/applications/${result.application.id}/accept`)).body;
  assert.deepEqual(accepted.application.acceptedOffer, result.decision.offer);
}));

test('E2E C: NEEDS_INFO → add financials and a statement → reprocess → APPROVED', () => api(async (call) => {
  const first = await journey(call, '0003000030');
  const id = first.application.id;
  assert.equal(first.application.state, 'NEEDS_INFO');
  assert.deepEqual(first.decision.requiredInfo.map((i: Json) => i.code), ['DECLARED_FINANCIALS', 'FINANCIAL_STATEMENT']);
  assert.equal((await call('POST', `/applications/${id}/submit`)).body.code, 'INVALID_TRANSITION', 'cannot resubmit without changes');
  let view = (await call('PATCH', `/applications/${id}`, { declaredFinancials: { revenue: 18_000_000, expenses: 13_200_000, currentDebt: 500_000 } })).body;
  assert.equal(view.application.state, 'READY_TO_SUBMIT');
  view = (await call('POST', `/applications/${id}/documents`, doc('FINANCIAL_STATEMENT'))).body;
  assert.equal((await call('POST', `/applications/${id}/submit`)).body.application.attempt, 2);
  const second = (await call('POST', `/applications/${id}/process`)).body;
  assert.equal(second.application.state, 'APPROVED', JSON.stringify(second.decision));
  const bank = (await call('GET', `/bank/applications/${id}`)).body;
  assert.deepEqual(bank.checks.map((c: Json) => [c.provider, c.status]), [['FNS', 'OK'], ['BKI', 'OK'], ['FINANCE', 'DOCUMENT_BASED']]);
  assert.equal(bank.history.checks.length, 6, 'both attempts are kept');
}));

test('E2E D: REJECTED is final and explains why', () => api(async (call) => {
  const result = await journey(call, '0004000040');
  assert.equal(result.application.state, 'REJECTED'); assert.equal(result.decision.offer, null);
  assert.ok(result.decision.reasons.some((r: Json) => r.code === 'CRITICAL_OVERDUE'));
  assert.equal((await call('POST', `/applications/${result.application.id}/accept`)).body.code, 'INVALID_TRANSITION');
  const bank = (await call('GET', '/bank/applications')).body.applications[0];
  assert.equal(bank.outcome, 'REJECTED'); assert.equal(bank.riskLevel, 'HIGH');
}));

test('processing is idempotent: repeated submit/process calls do not duplicate checks, scores or events', () => api(async (call) => {
  const result = await journey(call, '0001000010'), id = result.application.id;
  const before = (await call('GET', `/applications/${id}/events`)).body.events.length;
  const again = await call('POST', `/applications/${id}/process`);
  assert.equal(again.status, 200); assert.equal(again.body.replayed, true); assert.equal(again.body.application.state, 'APPROVED');
  assert.equal((await call('POST', `/applications/${id}/submit`)).body.code, 'INVALID_TRANSITION');
  assert.equal((await call('GET', `/applications/${id}/events`)).body.events.length, before);
  assert.equal((await call('GET', `/bank/applications/${id}`)).body.history.checks.length, 3);
}));

test('a manually entered company is evaluated on documents and declared numbers', () => api(async (call) => {
  const company = { inn: '7707083893', name: 'ООО «Ручной ввод»', registrationDate: '2018-01-15', okved: '62.01', region: 'Москва' };
  const created = await call('POST', '/applications', { companyInn: company.inn, company, productId: 'working-capital', purpose: 'WORKING_CAPITAL',
    requestedAmount: 1_000_000, requestedTermMonths: 12, purposeDescription: description,
    declaredFinancials: { revenue: 30_000_000, expenses: 24_000_000, currentDebt: 0 } });
  const id = created.body.application.id;
  assert.equal(created.body.company.source, 'manual');
  for (const type of ['BANK_STATEMENT', 'FINANCIAL_STATEMENT', 'REGISTRY_EXTRACT']) await call('POST', `/applications/${id}/documents`, doc(type));
  await call('POST', `/applications/${id}/submit`);
  const result = (await call('POST', `/applications/${id}/process`)).body;
  assert.equal(result.application.state, 'APPROVED', JSON.stringify(result.decision));
  const bank = (await call('GET', `/bank/applications/${id}`)).body;
  assert.deepEqual(bank.checks.map((c: Json) => c.status), ['DOCUMENT_BASED', 'NO_HISTORY', 'DOCUMENT_BASED']);
}));
