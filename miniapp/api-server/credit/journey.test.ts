import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app';
import { ApplicationService } from './service';
import { CreditStore } from './store';
import { demoDeclaredFinancials } from './synthetic-data';

type Json = any;
type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: Json }>;
async function api(run: (call: Call) => Promise<void>) {
  const credit = new ApplicationService(new CreditStore(), { now: () => new Date('2026-10-22T09:00:00Z') });
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
const doc = (type: string) => ({ type, fileName: `${type.toLowerCase()}.pdf`, mimeType: 'application/pdf', sizeBytes: 50_000, textCharacters: 1200 });

/** Five steps on one application: need → matching → questionnaire → review → decision. */
async function fiveSteps(call: Call, inn: string, extra: Json = {}) {
  const company = (await call('GET', `/companies/${inn}`)).body.company;
  const need = company.demo.need;
  // 1. Потребность — the application exists from the first step.
  const created = await call('POST', '/applications', { companyInn: inn, ...need, purposeDescription: 'Цель описана на первом шаге для теста',
    ...(demoDeclaredFinancials[inn] && company.relationship === 'non_client' ? { declaredFinancials: demoDeclaredFinancials[inn] } : {}), ...extra });
  assert.equal(created.status, 201);
  const id = created.body.application.id;
  assert.equal(created.body.application.productId, null);
  // 2. Подбор
  const { body: matching } = await call('GET', `/applications/${id}/matches`);
  const recommended = matching.matches.find((m: Json) => m.recommended);
  assert.ok(recommended, 'a product is recommended');
  for (const key of ['fitReasons', 'dataUsed', 'constraints', 'risks', 'alternatives']) assert.ok(Array.isArray(recommended[key]), key);
  assert.equal(recommended.pricing.rate, recommended.pricing.keyRate + recommended.pricing.productMargin + recommended.pricing.riskPremium);
  // 3. Анкета
  await call('PATCH', `/applications/${id}`, { productId: recommended.product.id });
  const docs = [...recommended.product.requiredDocuments, ...(company.relationship === 'non_client' ? ['FINANCIAL_STATEMENT'] : [])];
  let view: Json;
  for (const type of docs) view = (await call('POST', `/applications/${id}/documents`, doc(type))).body;
  assert.equal(view.application.state, 'READY_TO_SUBMIT', JSON.stringify(view.readiness.missing));
  // 4. Рассмотрение → 5. Решение
  await call('POST', `/applications/${id}/submit`);
  return { id, matching, result: (await call('POST', `/applications/${id}/process`)).body };
}

test('free-text need is parsed deterministically without any LLM', () => api(async (call) => {
  const parsed = (await call('POST', '/assistant/parse-need', { text: 'Хочу открыть вторую кофейню, купить оборудование и сделать ремонт. Нужно около 4 млн рублей' })).body;
  assert.equal(parsed.purpose, 'NEW_LOCATION'); assert.equal(parsed.amount, 4_000_000); assert.equal(parsed.suggestedTerm, 36);
  assert.equal(parsed.source, 'rules'); assert.equal(parsed.financingCategory, 'Инвестиционное финансирование');
  assert.equal((await call('POST', '/assistant/parse-need', { text: '' })).body.code, 'VALIDATION_ERROR');
}));

test('client data is prefilled; non-client data must be confirmed in the questionnaire', () => api(async (call) => {
  const client = (await call('POST', '/applications', { companyInn: '0001000010' })).body;
  assert.equal(client.company.relationship, 'client'); assert.ok(client.company.bankProfile.products.length);
  assert.equal(client.application.declaredFinancials.revenue, 48_000_000, 'prefilled from synthetic bank data');
  const nonClient = (await call('POST', '/applications', { companyInn: '0005000050' })).body;
  assert.equal(nonClient.company.relationship, 'non_client'); assert.equal(nonClient.application.declaredFinancials, null);
  const required = nonClient.readiness.items.filter((i: Json) => i.required).map((i: Json) => i.code);
  assert.ok(required.includes('declaredFinancials') && required.includes('document:FINANCIAL_STATEMENT'));
  for (const item of nonClient.readiness.items) assert.ok(['company', 'finance', 'obligations', 'history', 'financing', 'documents'].includes(item.group));
}));

test('matching uses business facts: affordability, credit history and alternatives', () => api(async (call) => {
  const id = (await call('POST', '/applications', { companyInn: '0002000020', purpose: 'EQUIPMENT', requestedAmount: 15_000_000, requestedTermMonths: 36 })).body.application.id;
  const { body } = await call('GET', `/applications/${id}/matches`);
  assert.equal(body.keyRate, 16); assert.equal(body.facts.financeSource, 'bank');
  const investment = body.matches.find((m: Json) => m.product.id === 'investment');
  assert.equal(investment.recommended, true); assert.equal(investment.affordability.status, 'unaffordable');
  assert.ok(investment.risks.some((r: string) => /50% среднемесячной прибыли/.test(r)));
  assert.ok(investment.alternatives.some((a: string) => /Расчётно доступно до/.test(a)));
  const equipment = body.matches.find((m: Json) => m.product.id === 'equipment');
  assert.equal(equipment.eligible, false); assert.ok(equipment.alternatives.some((a: string) => /Подходит/.test(a)));
  const d = (await call('POST', '/applications', { companyInn: '0004000040', purpose: 'WORKING_CAPITAL', requestedAmount: 5_000_000, requestedTermMonths: 24 })).body.application.id;
  const risky = (await call('GET', `/applications/${d}/matches`)).body.matches[0];
  assert.ok(risky.risks.some((r: string) => /просрочка/i.test(r)));
}));

test('refinancing requires existing debt', () => api(async (call) => {
  const id = (await call('POST', '/applications', { companyInn: '0006000060', purpose: 'REFINANCING', requestedAmount: 1_500_000, requestedTermMonths: 24,
    declaredFinancials: demoDeclaredFinancials['0006000060'] })).body.application.id;
  const refinancing = (await call('GET', `/applications/${id}/matches`)).body.matches.find((m: Json) => m.product.id === 'refinancing');
  assert.equal(refinancing.eligible, false);
  assert.match(refinancing.checks.find((c: Json) => c.code === 'existingDebt').text, /Нет действующих кредитов/);
}));

test('E: non-client goes through all five steps and is approved', () => api(async (call) => {
  const { result } = await fiveSteps(call, '0005000050');
  assert.equal(result.application.state, 'APPROVED', JSON.stringify(result.decision));
  assert.equal(result.decision.offer.productId, 'investment'); assert.equal(result.decision.offer.amount, 4_000_000);
}));

test('F: young business gets a counter offer on the young-business product with a risk premium', () => api(async (call) => {
  const { result, matching } = await fiveSteps(call, '0006000060');
  assert.equal(matching.matches[0].product.id, 'young-business');
  assert.equal(result.application.state, 'COUNTER_OFFER');
  assert.equal(result.decision.offer.productId, 'young-business');
  assert.ok(result.decision.offer.amount < 800_000); assert.ok(result.decision.offer.pricing.riskPremium > 0);
}));

test('post-decision lifecycle: accept → sign → issue → simulated payments → opportunities', () => api(async (call) => {
  const { id } = await fiveSteps(call, '0001000010');
  assert.equal((await call('POST', `/applications/${id}/issue`)).body.code, 'INVALID_TRANSITION', 'cannot issue before signing');
  assert.equal((await call('POST', `/applications/${id}/payments`)).body.code, 'INVALID_STATE');
  await call('POST', `/applications/${id}/accept`); await call('POST', `/applications/${id}/sign`);
  let view = (await call('POST', `/applications/${id}/issue`)).body;
  assert.equal(view.application.state, 'ACTIVE_FINANCING');
  assert.equal(view.financing.remainingPrincipal, 3_000_000); assert.equal(view.financing.nextPayment.date, '2026-11-22');
  assert.equal(view.financing.simulated, true);
  view = (await call('POST', `/applications/${id}/payments`)).body;
  assert.equal(view.financing.paidInstallments, 1); assert.ok(view.financing.remainingPrincipal < 3_000_000);
  assert.ok(view.financing.opportunities.some((o: Json) => o.code === 'LIMIT_INCREASE' && !o.available && /6 платежей/.test(o.condition)));
  for (let i = 0; i < 11; i++) view = (await call('POST', `/applications/${id}/payments`)).body;
  assert.equal(view.financing.status, 'REPAID'); assert.equal(view.financing.remainingPrincipal, 0); assert.equal(view.financing.nextPayment, null);
  assert.equal((await call('POST', `/applications/${id}/payments`)).body.code, 'FINANCING_REPAID');
  assert.equal((await call('POST', `/applications/${id}/issue`)).body.code, 'INVALID_TRANSITION', 'cannot issue twice');
  const events = (await call('GET', `/applications/${id}/events`)).body.events;
  assert.equal(events.filter((e: Json) => e.type === 'PAYMENT_SIMULATED').length, 12);
}));

test('declared credit history is compared with the bureau and explained, not decided by it', () => api(async (call) => {
  const id = (await call('POST', '/applications', { companyInn: '0004000040', productId: 'working-capital', purpose: 'WORKING_CAPITAL',
    requestedAmount: 5_000_000, requestedTermMonths: 24, purposeDescription: 'Закупка материалов для объектов',
    declaredCreditHistory: { hadOverdue12m: false, maxOverdueDays: 0 } })).body.application.id;
  await call('POST', `/applications/${id}/documents`, doc('BANK_STATEMENT'));
  await call('POST', `/applications/${id}/submit`);
  const result = (await call('POST', `/applications/${id}/process`)).body;
  assert.equal(result.application.state, 'REJECTED');
  assert.equal(result.decision.reasons[0].code, 'CRITICAL_OVERDUE');
  assert.ok(result.decision.reasons.some((r: Json) => r.code === 'DECLARED_HISTORY_MISMATCH'), 'self-report is checked against the bureau');
  assert.equal((await call('PATCH', `/applications/${id}`, { declaredCreditHistory: { hadOverdue12m: true, maxOverdueDays: 97 } })).body.code, 'APPLICATION_LOCKED');
  const invalid = await call('POST', '/applications', { companyInn: '0001000010', declaredCreditHistory: { hadOverdue12m: true } });
  assert.equal(invalid.body.details.field, 'declaredCreditHistory.maxOverdueDays');
}));
