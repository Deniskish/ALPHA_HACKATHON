// Browser E2E of «Опора» against a running frontend + API (no mocks: real API, SQLite and the ML risk model).
// Five visible steps of one application, clients (A–D) and non-clients (E–F), decision, improvements, simulated
// issue and payment, the bank side. Desktop 1280 and phone 390.
// OPORA_UI_URL=http://127.0.0.1:3000 node scripts/credit-e2e.check.cjs
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const url = process.env.OPORA_UI_URL || 'http://127.0.0.1:3000';
const out = process.env.OPORA_UI_OUTPUT || path.resolve('test-results/credit-e2e');
const engines = (process.env.OPORA_UI_ENGINE || 'chromium').split(',');
fs.mkdirSync(out, { recursive: true });

async function noOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
}

async function start(page) {
  await page.goto(url + '/#/');
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByText('Демонстрационный сценарий: реальной авторизации').waitFor();
}

async function loginClient(page, name) {
  await start(page);
  await page.getByText('Я клиент Альфа-Банка', { exact: true }).click();
  await page.getByRole('button', { name: `Войти как ${name}` }).click();
  await page.getByText('Клиент банка · демо').waitFor();
}

async function loginNonClient(page, inn) {
  await start(page);
  await page.getByText('Я пока не клиент Альфа-Банка', { exact: true }).click();
  await page.getByRole('button', { name: new RegExp(inn) }).click();
  await page.getByRole('button', { name: 'Найти' }).click();
  await page.getByText('Проверьте сведения о компании').waitFor();
  await page.getByRole('button', { name: 'Данные верны, продолжить' }).click();
  await page.getByText('Пока не клиент банка · демо').waitFor();
}

/** Steps 1–4: need → matching → questionnaire → review. */
async function apply(page, { nonClient = false, text, validate = false } = {}) {
  await page.getByRole('button', { name: 'Получить финансирование' }).click();
  const steps = await page.locator('.op-steps').innerText();
  for (const step of ['Потребность', 'Подбор', 'Анкета', 'Рассмотрение', 'Решение']) assert.match(steps, new RegExp(step));
  if (text) {
    await page.locator('textarea').first().fill(text);
    await page.getByRole('button', { name: 'Разобрать описание' }).click();
    await page.getByText(/Распознано по правилам|AI-ассистент/).waitFor();
  }
  if (nonClient) await page.getByRole('button', { name: 'Заполнить демо-данными' }).click();
  await page.getByRole('button', { name: 'Подобрать финансирование' }).click();
  const product = page.locator('.op-product[data-recommended="true"]');
  await product.waitFor();
  assert.match(await product.innerText(), /Почему подходит/);
  assert.match(await product.innerText(), /ключевая/);
  await noOverflow(page);
  await product.getByRole('button', { name: 'Выбрать продукт' }).click();
  await page.locator('.op-readiness').waitFor();
  await page.locator('.op-workspace-side').getByRole('button', { name: 'Заполнить демо-данными' }).click();
  await readyToSubmit(page);
  if (validate) await checkInlineValidation(page);
  await page.locator('.op-submit').click();
  await page.getByText('Рассматриваем заявку').waitFor();
  await page.getByText('Оцениваем риски', { exact: true }).waitFor();
}

/** The questionnaire says «Всё обязательное заполнено» and the submit button is not busy. */
async function readyToSubmit(page) {
  await page.waitForFunction(() => document.querySelector('.op-readiness')?.getAttribute('data-ready') === 'true'
    && !document.querySelector('.op-submit')?.hasAttribute('disabled'), null, { timeout: 15000 });
}

async function resultOf(page) {
  await page.waitForFunction(() => document.querySelector('.op-result[data-outcome]') || document.querySelector('.op-status[data-state="NEEDS_INFO"]'), null, { timeout: 20000 });
  return (await page.locator('.op-result').getAttribute('data-outcome').catch(() => null)) ?? 'NEEDS_INFO';
}

/** Anketa explains an invalid field right at the field and in the readiness block (the «90%» problem). */
async function checkInlineValidation(page) {
  const description = page.locator('#field-description textarea');
  const before = await description.inputValue();
  await description.fill('Закупка сырья');
  await description.blur();
  await page.getByText('Опишите цель подробнее: нужно не меньше 20 символов, сейчас 13.').waitFor();
  await page.locator('.op-readiness').getByText('Осталось 1 обязательное поле').waitFor({ timeout: 10000 });
  await page.locator('.op-submit').click();
  await page.getByText(/Исправьте 1 поле/).waitFor();
  await description.fill(before);
  await description.blur();
  await readyToSubmit(page);
}

async function run(engine, width, height) {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const label = `${engine}-${width}`;
  const shot = (name) => page.screenshot({ path: path.join(out, `${label}-${name}.png`), fullPage: true });
  try {
    // A — client, APPROVED → accept → simulated signing → simulated issue → payment → next opportunities.
    await loginClient(page, 'ООО «Демо Хлебозавод»');
    await apply(page, { validate: true });
    assert.equal(await resultOf(page), 'APPROVED');
    await page.getByText(/Мы готовы выдать 3\s000\s000\s₽/).first().waitFor();
    await page.locator('.op-explanation').waitFor();
    assert.match(await page.locator('.op-offer .op-rate').innerText(), /19,5% годовых\s+16% ключевая ставка \+ 3,5% маржа/);
    await noOverflow(page); await shot('a-approved');
    await page.getByRole('button', { name: 'Принять предложение' }).click();
    await page.getByRole('button', { name: 'Подписать договор (симуляция)' }).click();
    await page.getByRole('button', { name: 'Получить финансирование (симуляция)' }).click();
    await page.getByText('Следующие возможности').waitFor();
    await page.getByRole('button', { name: 'Смоделировать очередной платёж' }).click();
    await page.getByText(/Оплачено 1 из 12 платежей/).waitFor();
    await noOverflow(page); await shot('a-financing');

    // B — client, COUNTER_OFFER with «Как улучшить заявку».
    await loginClient(page, 'ООО «Демо Техсервис»');
    await apply(page);
    assert.equal(await resultOf(page), 'COUNTER_OFFER');
    assert.match(await page.locator('.op-result-summary').innerText(), /вместо запрошенных 15\s000\s000\s₽/);
    await page.getByRole('heading', { name: 'Как улучшить заявку' }).waitFor();
    await page.locator('.op-scenario[data-current="false"]').first().waitFor();
    assert.match(await page.locator('.op-improve').innerText(), /Расчётные сценарии/);
    assert.doesNotMatch(await page.locator('.op-improve').innerText(), /гарантир/i);
    await noOverflow(page); await shot('b-counter-offer');
    await page.getByRole('button', { name: 'Принять встречное предложение' }).click();
    await page.getByText('Предложение принято', { exact: true }).first().waitFor();

    // C — client without financial data: NEEDS_INFO → add figures and a statement → APPROVED.
    await loginClient(page, 'ООО «Демо Агро»');
    await apply(page);
    assert.equal(await resultOf(page), 'NEEDS_INFO');
    await shot('c-needs-info');
    await page.getByLabel('Выручка, ₽').fill('18000000');
    await page.getByLabel('Расходы, ₽').fill('13200000');
    await page.getByLabel('Текущие кредиты и займы, ₽').fill('500000');
    await page.getByLabel('Текущие кредиты и займы, ₽').blur();
    await page.locator('.op-documents li', { hasText: 'Бухгалтерская отчётность' }).getByRole('button', { name: 'Демо-файл' }).click();
    await readyToSubmit(page);
    await page.locator('.op-submit').click();
    assert.equal(await resultOf(page), 'APPROVED');

    // D — client, REJECTED with reasons.
    await loginClient(page, 'ООО «Демо Ремстрой»');
    await apply(page);
    assert.equal(await resultOf(page), 'REJECTED');
    assert.match(await page.locator('.op-result-main .op-reasons').innerText(), /просрочк/i);
    await shot('d-rejected');

    // E — non-client found by INN, free-text need, own figures → APPROVED.
    await loginNonClient(page, '0005000050');
    await apply(page, { nonClient: true, text: 'Хочу открыть вторую кофейню, купить оборудование и сделать ремонт. Нужно около 4 млн рублей' });
    assert.equal(await resultOf(page), 'APPROVED');
    await shot('e-nonclient-approved');

    // F — young non-client business → COUNTER_OFFER on the young-business product.
    await loginNonClient(page, '0006000060');
    await apply(page, { nonClient: true });
    assert.equal(await resultOf(page), 'COUNTER_OFFER');
    assert.match(await page.locator('.op-result-main').innerText(), /Развитие молодого бизнеса/);

    // Bank side: the same applications from inside, with mock checks, ML risk, scoring, decision and transitions.
    await page.getByRole('link', { name: 'Рабочее место банка' }).click();
    await page.locator('.op-kpis').waitFor();
    const rows = width >= 900 ? page.locator('.op-table tbody tr') : page.locator('.op-bank .op-list .op-application-card');
    await rows.first().waitFor();
    assert.ok(await rows.count() >= 6);
    await rows.filter({ hasText: 'Демо Ремстрой' }).first().click();
    await page.locator('.op-pipeline').getByText('RESULT: REJECTED').waitFor();
    await page.getByRole('tab', { name: 'Риск и скоринг' }).click();
    await page.getByText('ML-модель риска').waitFor();
    assert.match(await page.locator('.op-bank-detail').innerText(), /вероятность проблемного обслуживания/);
    await page.getByRole('tab', { name: 'История' }).click();
    assert.match(await page.locator('.op-events').innerText(), /DECISION → REJECTED/);
    await noOverflow(page); await shot('bank');

    // Dashboard of the current company lists its applications.
    await page.getByRole('link', { name: 'Клиентский кабинет' }).click();
    await page.getByRole('heading', { name: 'Последние результаты' }).waitFor();
    await noOverflow(page);
    assert.deepEqual(errors, []);
    console.log(`${label} PASS`);
  } catch (error) {
    await shot('failure').catch(() => {});
    throw error;
  } finally { await browser.close(); }
}

(async () => {
  for (const engine of engines)
    for (const [width, height] of [[1280, 900], [390, 844]]) await run(engine, width, height);
})().catch((error) => { console.error(error); process.exitCode = 1; });
