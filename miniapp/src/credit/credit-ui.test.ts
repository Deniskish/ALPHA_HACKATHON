import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseRoute, routeHash, shellOf, type Route } from './routes';
import { readinessSummary } from './readiness-view';
import { Rate } from './ui';
import { groupDigits, months, parseAmount } from './format';
import { latestRun, processingStages } from './ApplicationProcessing';
import { ApplicationResult } from './ApplicationResult';
import { CreditDashboard } from './CreditDashboard';
import { isoDate } from './StartScreen';
import { reachedStage } from './ApplicationPage';
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
  const routes: Route[] = [{ name: 'dashboard' }, { name: 'new' }, { name: 'bank' }, { name: 'application', id: 'a-1' },
    { name: 'application', id: 'a-1', stage: 'match' }, { name: 'application', id: 'a-1', stage: 'decision' }, { name: 'bank-application', id: 'b 2' }];
  for (const route of routes) assert.deepEqual(parseRoute(routeHash(route)), route);
  assert.deepEqual(parseRoute('#/nowhere'), { name: 'dashboard' });
  assert.deepEqual(parseRoute(''), { name: 'dashboard' });
  assert.deepEqual(parseRoute('#/applications/a-1/unknown'), { name: 'application', id: 'a-1' });
  // Client and bank are separate route shells; links of the previous version still open.
  assert.equal(routeHash({ name: 'application', id: 'a-1', stage: 'form' }), '#/credit/applications/a-1/form');
  assert.deepEqual(parseRoute('#/applications/a-1/form'), { name: 'application', id: 'a-1', stage: 'form' });
  assert.equal(shellOf(parseRoute('#/bank/applications/x')), 'bank'); assert.equal(shellOf(parseRoute('#/credit/new')), 'client');
});

test('amount input accepts grouped digits and month labels are declined', () => {
  assert.equal(parseAmount('3 000 000 ₽'), 3_000_000); assert.equal(parseAmount(''), null);
  assert.equal(groupDigits(2_500_000), '2 500 000'); assert.equal(groupDigits(null), '');
  assert.deepEqual([1, 3, 12, 21, 24].map(months), ['1 месяц', '3 месяца', '12 месяцев', '21 месяц', '24 месяца']);
  assert.equal(isoDate('05.03.2021'), '2021-03-05'); assert.equal(isoDate('31.02.2021'), null); assert.equal(isoDate('2021-03-05'), null);
});

test('client-facing labels never expose internal bank or engine terms', () => {
  for (const state of applicationStates) {
    assert.doesNotMatch(clientStateLabels[state].title, internalTerms, state);
    assert.doesNotMatch(clientStateLabels[state].next, internalTerms, state);
  }
  for (const stage of processingStages) assert.doesNotMatch(stage.title + stage.detail, internalTerms);
  for (const label of Object.values(providerLabels)) assert.doesNotMatch(label.client, internalTerms);
  assert.deepEqual(processingStages.map((s) => s.title), ['Проверяем данные компании', 'Получаем сведения', 'Оцениваем риски', 'Оцениваем заявку', 'Формируем решение']);
});

test('status badges, flow steps and reasons render plain-language markup', () => {
  assert.match(renderToStaticMarkup(createElement(StatusBadge, { state: 'NEEDS_INFO' })), /Нужны дополнительные данные/);
  assert.match(renderToStaticMarkup(createElement(StatusBadge, { state: 'SCORING', internal: true })), />SCORING</);
  const steps = renderToStaticMarkup(createElement(FlowSteps, { current: 2 }));
  assert.equal((steps.match(/aria-current="step"/g) ?? []).length, 1);
  for (const step of ['Потребность', 'Подбор', 'Анкета', 'Рассмотрение', 'Решение']) assert.match(steps, new RegExp(step));
  assert.match(steps, /aria-current="step">Анкета/);
  const reasons = renderToStaticMarkup(createElement(ReasonList, { reasons: [
    { code: 'a', kind: 'positive', text: 'Просрочек нет' }, { code: 'b', kind: 'warning', text: 'Сумма высока' }] }));
  assert.match(reasons, /data-kind="positive"><svg[^]*?<span>Просрочек нет<\/span>/); assert.match(reasons, /data-kind="warning"><svg[^]*?<span>Сумма высока<\/span>/);
});

test('approved result explains what happened, why and what to do next', async () => {
  const view = await decided('0001000010');
  const html = renderToStaticMarkup(createElement(ApplicationResult, { view, onChange() {} }));
  for (const text of ['Заявка одобрена', 'Что произошло', 'Почему', 'Что дальше', 'Принять предложение', 'Просрочек по кредитам нет'])
    assert.ok(html.includes(text), text);
  // Internal engine / bank terms must not appear in client-facing result
  // (Filter out B2BNetworkGraph which explains banking mechanics or check specifically)
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), internalTerms);
  const run = latestRun(view);
  assert.equal(run.stages, 5); assert.equal(run.checks.length, 3);
  assert.equal(reachedStage(view), 'decision');
});

test('counter offer shows offered versus requested terms; rejection offers a new application', async () => {
  const counter = renderToStaticMarkup(createElement(ApplicationResult, { view: await decided('0002000020'), onChange() {} }));
  assert.match(counter, /встречное предложение/i); assert.match(counter.replace(/<[^>]+>/g, ''), /запрошено\s*15\s000\s000\s₽/);
  const rejected = renderToStaticMarkup(createElement(ApplicationResult, { view: await decided('0004000040'), onChange() {} }));
  assert.match(rejected, /Заявка не одобрена/); assert.match(rejected, /Новая заявка/); assert.doesNotMatch(rejected, /Принять/);
});

test('dashboard shows bank data for a client and marks it synthetic', async () => {
  const service = new ApplicationService(new CreditStore(), { now: () => now });
  const render = (inn: string, relationship: 'client' | 'non_client') => renderToStaticMarkup(createElement(CreditDashboard,
    { session: { relationship, manual: null, company: { ...service.store.getCompany(inn)!, syntheticLabel: null } } }));
  const client = render('0001000010', 'client');
  for (const text of ['Синтетические демонстрационные данные', 'Клиент банка · демо', 'Обороты по счёту', 'Получить финансирование', '0001000010'])
    assert.ok(client.includes(text), text);
  const nonClient = render('0005000050', 'non_client');
  assert.match(nonClient, /Пока не клиент банка/); assert.doesNotMatch(nonClient, /Обороты по счёту/);
  service.store.close();
});

test('a new application starts at matching and moves to the questionnaire once a product is chosen', () => {
  const base = { productId: null, state: 'DRAFT' } as const;
  assert.equal(reachedStage({ application: base } as never), 'match');
  assert.equal(reachedStage({ application: { ...base, productId: 'working-capital' } } as never), 'form');
  assert.equal(reachedStage({ application: { ...base, productId: 'working-capital', state: 'SCORING' } } as never), 'review');
  assert.equal(reachedStage({ application: { ...base, productId: 'working-capital', state: 'ACTIVE_FINANCING' } } as never), 'decision');
});

test('rate and its composition are separate lines with a readable text', () => {
  const html = renderToStaticMarkup(createElement(Rate, { rate: 19.5, pricing: { keyRate: 16, productMargin: 3.5, riskPremium: 0 } }));
  assert.match(html, /<span class="op-rate-total"><strong>19,5%<\/strong> годовых<\/span>/);
  assert.match(html, /<span class="op-rate-parts">16% ключевая ставка \+ 3,5% маржа<\/span>/);
  // Copy/paste and screen readers get «19,5% годовых 16% ключевая…», never «годовых16%».
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ''), /годовых16/);
});

test('readiness explains what is left instead of a bare percentage', () => {
  const item = (code: string, required: boolean, done: boolean) => ({ code, label: code === 'purposeDescription' ? 'Описание цели финансирования' : 'Обязательства и кредитная история (по вашим данным)',
    required, done, group: 'financing' as const });
  const oneLeft = readinessSummary({ ready: false, completeness: 0.9, items: [item('product', true, true), item('purposeDescription', true, false), item('obligations', false, false)],
    missing: [item('purposeDescription', true, false)] }, 'Закупка сырья');
  assert.equal(oneLeft.headline, 'Осталось 1 обязательное поле');
  assert.match(oneLeft.detail, /описание цели — ещё 7 символов/);
  const optionalOnly = readinessSummary({ ready: true, completeness: 0.9, items: [item('product', true, true), item('obligations', false, false)], missing: [] });
  assert.equal(optionalOnly.headline, 'Всё обязательное заполнено');
  assert.match(optionalOnly.detail, /можно отправить.*1 желательный пункт/i);
});
