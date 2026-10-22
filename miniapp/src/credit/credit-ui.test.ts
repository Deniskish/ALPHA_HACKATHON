import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseRoute, routeHash, type Route } from './routes';
import { groupDigits, months, parseAmount } from './format';
import { latestRun, processingStages } from './ApplicationProcessing';
import { ApplicationResult } from './ApplicationResult';
import { CompanyProfile } from './NewCredit';
import { FlowSteps, ReasonList, StatusBadge } from './ui';
import { clientStateLabels, providerLabels } from '../../api-server/credit/labels';
import { ApplicationService } from '../../api-server/credit/service';
import { CreditStore } from '../../api-server/credit/store';
import { applicationStates } from '../../api-server/credit/types';

const internalTerms = /\b(BKI|БКИ|FNS|scoring|скоринг|VALIDATING|ENRICHING|SCORING|DECISION|mock|engine)\b/i;
const now = new Date('2026-10-01T09:00:00Z');

/** Runs a demo company through the real service to obtain an actual client view. */
async function decided(inn: string) {
  const service = new ApplicationService(new CreditStore(), { now: () => now });
  const company = service.store.getCompany(inn)!, need = company.demo!.need;
  const product = need.purpose === 'EQUIPMENT' ? service.store.getProduct('investment')! : service.store.getProduct('working-capital')!;
  const { application } = await service.create({ companyInn: inn, patch: { ...need, productId: product.id, purposeDescription: 'Описание цели финансирования для теста' } });
  for (const type of product.requiredDocuments)
    service.addDocument(application.id, { type, fileName: `${type}.pdf`, mimeType: 'application/pdf', sizeBytes: 1000, textCharacters: 100 });
  service.submit(application.id);
  const view = service.process(application.id);
  service.store.close();
  return view;
}

test('hash routes round-trip and unknown paths fall back to the dashboard', () => {
  const routes: Route[] = [{ name: 'dashboard' }, { name: 'new' }, { name: 'bank' }, { name: 'application', id: 'a-1' }, { name: 'bank-application', id: 'b 2' }];
  for (const route of routes) assert.deepEqual(parseRoute(routeHash(route)), route);
  assert.deepEqual(parseRoute('#/nowhere'), { name: 'dashboard' });
  assert.deepEqual(parseRoute(''), { name: 'dashboard' });
});

test('amount input accepts grouped digits and month labels are declined', () => {
  assert.equal(parseAmount('3 000 000 ₽'), 3_000_000); assert.equal(parseAmount(''), null);
  assert.equal(groupDigits(2_500_000), '2 500 000'); assert.equal(groupDigits(null), '');
  assert.deepEqual([1, 3, 12, 21, 24].map(months), ['1 месяц', '3 месяца', '12 месяцев', '21 месяц', '24 месяца']);
});

test('client-facing labels never expose internal bank or engine terms', () => {
  for (const state of applicationStates) {
    assert.doesNotMatch(clientStateLabels[state].title, internalTerms, state);
    assert.doesNotMatch(clientStateLabels[state].next, internalTerms, state);
  }
  for (const stage of processingStages) assert.doesNotMatch(stage.title + stage.detail, internalTerms);
  for (const label of Object.values(providerLabels)) assert.doesNotMatch(label.client, internalTerms);
  assert.deepEqual(processingStages.map((s) => s.title), ['Проверяем данные компании', 'Получаем сведения', 'Оцениваем заявку', 'Формируем решение']);
});

test('status badges, flow steps and reasons render plain-language markup', () => {
  assert.match(renderToStaticMarkup(createElement(StatusBadge, { state: 'NEEDS_INFO' })), /Нужны дополнительные данные/);
  assert.match(renderToStaticMarkup(createElement(StatusBadge, { state: 'SCORING', internal: true })), />SCORING</);
  const steps = renderToStaticMarkup(createElement(FlowSteps, { current: 2 }));
  assert.equal((steps.match(/aria-current="step"/g) ?? []).length, 1); assert.match(steps, /Продукт/);
  const reasons = renderToStaticMarkup(createElement(ReasonList, { reasons: [
    { code: 'a', kind: 'positive', text: 'Просрочек нет' }, { code: 'b', kind: 'warning', text: 'Сумма высока' }] }));
  assert.match(reasons, /✓<\/span>Просрочек нет/); assert.match(reasons, /⚠<\/span>Сумма высока/);
});

test('approved result explains what happened, why and what to do next', async () => {
  const view = await decided('0001000010');
  const html = renderToStaticMarkup(createElement(ApplicationResult, { view, onChange() {} }));
  for (const text of ['Заявка одобрена', 'Что произошло', 'Почему', 'Что дальше', 'Принять предложение', 'Просрочек по кредитам нет'])
    assert.ok(html.includes(text), text);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), internalTerms);
  const run = latestRun(view);
  assert.equal(run.stages, 4); assert.equal(run.checks.length, 3);
});

test('counter offer shows offered versus requested terms; rejection offers a new application', async () => {
  const counter = renderToStaticMarkup(createElement(ApplicationResult, { view: await decided('0002000020'), onChange() {} }));
  assert.match(counter, /встречное предложение/i); assert.match(counter, /<s class="cc-muted">15\s000\s000\s₽<\/s>/);
  const rejected = renderToStaticMarkup(createElement(ApplicationResult, { view: await decided('0004000040'), onChange() {} }));
  assert.match(rejected, /Заявка не одобрена/); assert.match(rejected, /Новая заявка/); assert.doesNotMatch(rejected, /Принять/);
});

test('company profile marks synthetic data and shows financial indicators or their absence', async () => {
  const service = new ApplicationService(new CreditStore(), { now: () => now });
  const render = (inn: string) => renderToStaticMarkup(createElement(CompanyProfile, { company: { ...service.store.getCompany(inn)!, syntheticLabel: null } }));
  const a = render('0001000010');
  assert.match(a, /Синтетические демонстрационные данные/); assert.match(a, /Выручка/); assert.match(a, /0001000010/);
  assert.match(render('0003000030'), /Показателей в источниках нет/);
  service.store.close();
});
