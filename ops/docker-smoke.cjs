// Docker smoke test: build, start, run the six demo scenarios through nginx (clients A–D, non-clients E–F), ML risk,
// simulated issue and an idempotent payment, persistence after restart, then stop.
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

async function call(method, route, body, headers = {}) {
  const response = await fetch(origin + route, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const json = await response.json();
  if (!response.ok) throw new Error(`${method} ${route} → ${response.status} ${JSON.stringify(json)}`);
  return json;
}

// Figures a non-client enters in the questionnaire (same as the UI demo helper).
const declared = { '0005000050': { revenue: 26000000, expenses: 21300000, currentDebt: 1200000, activeLoans: 1 },
  '0006000060': { revenue: 6000000, expenses: 5100000, currentDebt: 0, activeLoans: 0 } };

async function waitForHealth() {
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(origin + '/api/health', { signal: AbortSignal.timeout(3000) })).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Stack did not become healthy');
}

async function scenario(inn) {
  const { companies } = await call('GET', '/api/demo/companies');
  const company = companies.find((c) => c.inn === inn), need = company.demo.need;
  let view = await call('POST', '/api/applications', { companyInn: inn, ...need, purposeDescription: 'Демо: проверка в Docker smoke test',
    ...(declared[inn] ? { declaredFinancials: declared[inn] } : {}) });
  const id = view.application.id;
  const { matches } = await call('GET', `/api/applications/${id}/matches`);
  const product = (matches.find((m) => m.recommended) ?? matches.find((m) => m.eligible)).product;
  await call('PATCH', `/api/applications/${id}`, { productId: product.id });
  const documents = [...product.requiredDocuments, ...(company.relationship === 'non_client' ? ['FINANCIAL_STATEMENT'] : [])];
  for (const type of documents)
    view = await call('POST', `/api/applications/${id}/documents`, { type, fileName: `${type}.pdf`, mimeType: 'application/pdf', sizeBytes: 1024, textCharacters: null });
  await call('POST', `/api/applications/${id}/submit`);
  return call('POST', `/api/applications/${id}/process`);
}

(async () => {
  compose('up', '-d', '--build');
  try {
    await waitForHealth();
    const index = await fetch(origin + '/');
    assert.equal(index.status, 200); assert.match(await index.text(), /Опора/);
    const healthResponse = await fetch(origin + '/api/health');
    assert.match(healthResponse.headers.get('x-request-id') ?? '', /^[0-9a-f]{32}$/, 'nginx request id reaches the API and comes back');
    const health = await healthResponse.json();
    assert.deepEqual({ ...health.credit, riskModel: typeof health.credit.riskModel }, { products: 6, demoCompanies: 6, storage: 'sqlite', keyRate: 16, riskModel: 'string' });
    assert.equal(health.ai.enabled, false, 'AI is optional and off by default');
    const outcomes = {};
    for (const [inn, expected] of [['0001000010', 'APPROVED'], ['0002000020', 'COUNTER_OFFER'], ['0003000030', 'NEEDS_INFO'], ['0004000040', 'REJECTED'],
      ['0005000050', 'APPROVED'], ['0006000060', 'COUNTER_OFFER']]) {
      const result = await scenario(inn);
      assert.equal(result.application.state, expected, inn);
      outcomes[inn] = result.application.id;
    }
    const a = outcomes['0001000010'];
    const risk = await call('GET', `/api/applications/${a}/risk`);
    assert.equal(risk.riskLevel, 'LOW'); assert.ok(risk.topFactors.length > 0);
    assert.equal((await call('GET', `/api/applications/${outcomes['0004000040']}/risk`)).riskLevel, 'HIGH');
    assert.ok((await call('GET', `/api/applications/${outcomes['0002000020']}/improvements`)).scenarios.length > 0);
    assert.equal((await call('GET', `/api/applications/${a}/explanation?kind=decision`)).source, 'template');
    for (const step of ['accept', 'sign', 'issue']) await call('POST', `/api/applications/${a}/${step}`);
    const key = { 'Idempotency-Key': 'smoke-payment-0001' };
    await call('POST', `/api/applications/${a}/payments`, undefined, key);
    const repeated = await call('POST', `/api/applications/${a}/payments`, undefined, key);
    assert.equal(repeated.financing.paidInstallments, 1, 'a retried payment is not counted twice');
    const c = outcomes['0003000030'];
    await call('PATCH', `/api/applications/${c}`, { declaredFinancials: { revenue: 18000000, expenses: 13200000, currentDebt: 500000 } });
    await call('POST', `/api/applications/${c}/documents`, { type: 'FINANCIAL_STATEMENT', fileName: 'statement.pdf', mimeType: 'application/pdf', sizeBytes: 2048, textCharacters: null });
    await call('POST', `/api/applications/${c}/submit`);
    assert.equal((await call('POST', `/api/applications/${c}/process`)).application.state, 'APPROVED');
    // Application state lives in SQLite on a named volume and survives an API restart.
    compose('restart', 'api');
    await waitForHealth();
    const bank = await call('GET', '/api/bank/applications');
    assert.ok(bank.applications.length >= 6);
    assert.equal((await call('GET', `/api/applications/${outcomes['0004000040']}`)).application.state, 'REJECTED');
    assert.equal((await call('GET', `/api/applications/${a}`)).financing.paidInstallments, 1);
    console.log('PASS docker compose: health, frontend, 6 scenarios, ML risk, improvements, issue + idempotent payment, NEEDS_INFO reprocessing, persistence after restart');
  } finally {
    if (!keep) compose('down', '-v');
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
