// Browser E2E of the credit conveyor against a running frontend + API (no mocks: real API and SQLite).
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

async function startApplication(page, companyName) {
  await page.goto(url + '/#/');
  await page.getByRole('button', { name: 'Получить финансирование' }).click();
  await page.getByText('Синтетические демонстрационные данные').first().waitFor();
  await page.getByRole('button', { name: `Выбрать ${companyName}` }).click();
  await page.getByRole('heading', { name: 'Профиль бизнеса' }).waitFor();
  await page.getByRole('button', { name: 'Подобрать продукты' }).click();
  const recommended = page.locator('.cc-product[data-recommended="true"]');
  await recommended.waitFor();
  assert.match(await recommended.innerText(), /Почему подходит/);
  await recommended.getByRole('button', { name: 'Выбрать продукт' }).click();
  await page.getByRole('heading', { name: 'Готовность заявки' }).waitFor();
  await page.getByRole('button', { name: 'Заполнить демо-данными' }).click();
  const submit = page.getByRole('button', { name: 'Отправить заявку' });
  await page.waitForFunction(() => !document.querySelector('.cc-submit')?.hasAttribute('disabled'));
  await submit.click();
  await page.getByRole('heading', { name: 'Обрабатываем заявку' }).waitFor();
  for (const stage of ['Проверяем данные компании', 'Получаем сведения']) await page.getByText(stage, { exact: true }).waitFor();
}

async function resultOf(page) {
  await page.waitForFunction(() => document.querySelector('.cc-result[data-outcome]') || document.querySelector('.cc-workspace .cc-alert-warning'), null, { timeout: 15000 });
  return page.locator('.cc-result').getAttribute('data-outcome').catch(() => 'NEEDS_INFO');
}

async function run(engine, width, height) {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const label = `${engine}-${width}`;
  try {
    // A — APPROVED → accept → simulated signing.
    await startApplication(page, 'ООО «Демо Хлебозавод»');
    assert.equal(await resultOf(page), 'APPROVED');
    await page.getByText(/Мы готовы выдать 3\s000\s000\s₽/).waitFor();
    await noOverflow(page);
    await page.screenshot({ path: path.join(out, `${label}-a-approved.png`), fullPage: true });
    await page.getByRole('button', { name: 'Принять предложение' }).click();
    await page.getByRole('button', { name: 'Подписать договор (симуляция)' }).click();
    await page.getByRole('heading', { name: 'Договор подписан' }).waitFor();

    // B — COUNTER_OFFER with a lower amount and a longer term.
    await startApplication(page, 'ООО «Демо Техсервис»');
    assert.equal(await resultOf(page), 'COUNTER_OFFER');
    assert.match(await page.locator('.cc-result-summary').innerText(), /вместо запрошенных 15\s000\s000\s₽/);
    await page.screenshot({ path: path.join(out, `${label}-b-counter-offer.png`), fullPage: true });
    await page.getByRole('button', { name: 'Принять встречное предложение' }).click();
    await page.getByText('Предложение принято', { exact: true }).first().waitFor();

    // C — NEEDS_INFO → add financials and a statement → reprocess → APPROVED.
    await startApplication(page, 'ООО «Демо Агро»');
    assert.equal(await resultOf(page), 'NEEDS_INFO');
    const banner = page.locator('.cc-workspace .cc-alert-warning');
    assert.match(await banner.innerText(), /выручку, расходы/);
    await page.screenshot({ path: path.join(out, `${label}-c-needs-info.png`), fullPage: true });
    await page.getByLabel('Выручка, ₽').fill('18000000');
    await page.getByLabel('Расходы, ₽').fill('13200000');
    await page.getByLabel('Текущие кредиты и займы, ₽').fill('500000');
    await page.getByLabel('Текущие кредиты и займы, ₽').blur();
    await page.waitForFunction(() => document.querySelector('[data-state]')?.textContent?.includes('Заполнение') || document.querySelector('[data-state="READY_TO_SUBMIT"]'));
    await page.locator('.cc-documents li', { hasText: 'Бухгалтерская отчётность' }).getByRole('button', { name: 'Демо-файл' }).click();
    await page.waitForFunction(() => !document.querySelector('.cc-submit')?.hasAttribute('disabled'));
    await page.getByRole('button', { name: 'Отправить заявку' }).click();
    assert.equal(await resultOf(page), 'APPROVED');

    // D — REJECTED with an explanation.
    await startApplication(page, 'ООО «Демо Ремстрой»');
    assert.equal(await resultOf(page), 'REJECTED');
    assert.match(await page.locator('.cc-reasons').innerText(), /просрочка/);
    await page.screenshot({ path: path.join(out, `${label}-d-rejected.png`), fullPage: true });

    // Bank side shows the internal process of the same applications.
    await page.getByRole('button', { name: 'Банковская сторона' }).click();
    await page.locator('.cc-table tbody tr').first().waitFor();
    assert.ok(await page.locator('.cc-table tbody tr').count() >= 4);
    await page.locator('.cc-table tbody tr', { hasText: 'Демо Ремстрой' }).first().click();
    for (const title of ['Внешние проверки (mock)', 'Скоринг', 'Кредитное решение', 'История событий'])
      await page.getByRole('heading', { name: title }).waitFor();
    assert.match(await page.locator('.cc-bank-detail').innerText(), /CRITICAL_OVERDUE|просрочка/i);
    assert.match(await page.locator('.cc-events').innerText(), /DECISION → REJECTED/);
    await noOverflow(page);
    await page.screenshot({ path: path.join(out, `${label}-bank.png`), fullPage: true });

    // Dashboard lists active applications and recent results.
    await page.getByRole('button', { name: 'Клиент' }).click();
    await page.getByRole('heading', { name: 'Активные заявки' }).waitFor();
    await page.getByRole('heading', { name: 'Последние результаты' }).waitFor();
    await noOverflow(page);
    assert.deepEqual(errors, []);
    console.log(`${label} PASS`);
  } catch (error) {
    await page.screenshot({ path: path.join(out, `${label}-failure.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}

(async () => {
  for (const engine of engines)
    for (const [width, height] of [[1280, 900], [390, 844]]) await run(engine, width, height);
})().catch((error) => { console.error(error); process.exitCode = 1; });
