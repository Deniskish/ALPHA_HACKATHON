// Docker smoke test: build, start, run the four demo scenarios through nginx, check persistence, stop.
// Usage: node ops/docker-smoke.cjs [--keep]   (isolated compose project on ports 3100/3102; its volume is removed)
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const project = process.env.SMOKE_PROJECT || 'credit-smoke';
const ports = { FRONTEND_PORT: process.env.FRONTEND_PORT || '3100', API_PORT: process.env.API_PORT || '3102' };
const origin = `http://127.0.0.1:${ports.FRONTEND_PORT}`;
const keep = process.argv.includes('--keep');
const compose = (...args) => execFileSync('docker', ['compose', '-p', project, ...args], { cwd: root, stdio: 'inherit', timeout: 900000,
  env: { ...process.env, ...ports } });

async function call(method, route, body) {
  const response = await fetch(origin + route, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const json = await response.json();
  if (!response.ok) throw new Error(`${method} ${route} → ${response.status} ${JSON.stringify(json)}`);
  return json;
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(origin + '/api/health', { signal: AbortSignal.timeout(3000) })).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Stack did not become healthy');
}

async function scenario(inn) {
  const { companies } = await call('GET', '/api/demo/companies');
  const need = companies.find((c) => c.inn === inn).demo.need;
  const { matches } = await call('GET', `/api/credit/products?inn=${inn}&purpose=${need.purpose}&amount=${need.requestedAmount}&term=${need.requestedTermMonths}`);
  const product = matches.find((m) => m.recommended).product;
  let view = await call('POST', '/api/applications', { companyInn: inn, productId: product.id, ...need, purposeDescription: 'Демо: проверка в Docker smoke test' });
  for (const type of product.requiredDocuments)
    view = await call('POST', `/api/applications/${view.application.id}/documents`, { type, fileName: `${type}.pdf`, mimeType: 'application/pdf', sizeBytes: 1024, textCharacters: null });
  await call('POST', `/api/applications/${view.application.id}/submit`);
  return call('POST', `/api/applications/${view.application.id}/process`);
}

(async () => {
  compose('up', '-d', '--build');
  try {
    await waitForHealth();
    const index = await fetch(origin + '/');
    assert.equal(index.status, 200); assert.match(await index.text(), /Кредитный кабинет/);
    const health = await call('GET', '/api/health');
    assert.deepEqual(health.credit, { products: 3, demoCompanies: 4, storage: 'sqlite' });
    const outcomes = {};
    for (const [inn, expected] of [['0001000010', 'APPROVED'], ['0002000020', 'COUNTER_OFFER'], ['0003000030', 'NEEDS_INFO'], ['0004000040', 'REJECTED']]) {
      const result = await scenario(inn);
      assert.equal(result.application.state, expected, inn);
      outcomes[inn] = result.application.id;
    }
    const c = outcomes['0003000030'];
    await call('PATCH', `/api/applications/${c}`, { declaredFinancials: { revenue: 18000000, expenses: 13200000, currentDebt: 500000 } });
    await call('POST', `/api/applications/${c}/documents`, { type: 'FINANCIAL_STATEMENT', fileName: 'statement.pdf', mimeType: 'application/pdf', sizeBytes: 2048, textCharacters: null });
    await call('POST', `/api/applications/${c}/submit`);
    assert.equal((await call('POST', `/api/applications/${c}/process`)).application.state, 'APPROVED');
    // Application state lives in SQLite on a named volume and survives an API restart.
    compose('restart', 'api');
    await waitForHealth();
    const bank = await call('GET', '/api/bank/applications');
    assert.ok(bank.applications.length >= 4);
    assert.equal((await call('GET', `/api/applications/${outcomes['0004000040']}`)).application.state, 'REJECTED');
    console.log('PASS docker compose: health, frontend, 4 scenarios, NEEDS_INFO reprocessing, persistence after restart');
  } finally {
    if (!keep) compose('down', '-v');
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
