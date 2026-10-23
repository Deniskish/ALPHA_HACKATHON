import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, trustProxySetting } from './app';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function server(env: NodeJS.ProcessEnv, run: (url: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'credit-api-'));
  const server = createApp({ env, fnsDir: dir }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }); await rm(dir, { recursive: true, force: true }); }
}

test('health and provider status are honest without any external service', () => server({}, async (url) => {
  const health = await fetch(url + '/api/health');
  assert.equal(health.status, 200); assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal((await health.json() as any).status, 'ok');
  const providers = await (await fetch(url + '/api/providers/status')).json() as any;
  assert.equal(providers.company.fnsRegistry, 'missing'); assert.equal(providers.company.activeProvider, 'fns');
  assert.deepEqual(providers.creditChecks, { fns: 'mock', bki: 'mock', finance: 'mock', network: false });
  // The optional registry lookup reports a missing index honestly; credit lookup falls back to manual entry.
  assert.equal((await fetch(url + '/api/company/7707083893')).status, 503);
  assert.equal((await fetch(url + '/api/company/invalid')).status, 400);
  assert.equal((await fetch(url + '/api/companies/7707083893')).status, 404);
  assert.equal((await fetch(url + '/api/funding/catalog')).status, 404, 'legacy funding routes are gone');
  assert.equal((await fetch(url + '/api/assistant', { method: 'POST' })).status, 404, 'no AI route in the mandatory flow');
}));

test('direct API responses are compressed even when ingress bypasses the frontend', () => server({}, async (url) => {
  const response = await fetch(url + '/api/credit/products', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-encoding'), 'gzip');
  assert.equal((await response.json() as any).products.length, 6);
}));

test('local ingress keeps per-client limits and does not trust a forged earlier forwarding hop', () => server({ API_RATE_LIMIT: '5' }, async (url) => {
  const send = (forwarded: string) => fetch(url + '/api/credit/products', { headers: { 'X-Forwarded-For': forwarded } });
  for (let i = 0; i < 5; i++) assert.equal((await send('198.51.100.10')).status, 200);
  const limited = await send('198.51.100.10');
  assert.equal(limited.status, 429); assert.equal((await limited.json() as any).code, 'RATE_LIMITED');
  assert.equal((await send('198.51.100.11')).status, 200, 'another client must not inherit the proxy-wide limit');
  assert.equal((await send('203.0.113.99, 198.51.100.10')).status, 429, 'forged leftmost hop cannot bypass the nearest untrusted client');
}));

test('forwarded headers are trusted only from a loopback peer', () => {
  const trust = createApp({ env: {} }).get('trust proxy fn');
  assert.equal(trust('127.0.0.1', 0), true);
  assert.equal(trust('::1', 0), true);
  assert.equal(trust('198.51.100.10', 0), false);
});

test('behind Docker nginx the private network is trusted, a blanket "true" is refused', () => {
  const trust = createApp({ env: { TRUST_PROXY: 'loopback,uniquelocal' } }).get('trust proxy fn');
  assert.equal(trust('172.18.0.5', 0), true, 'nginx container on the compose network');
  assert.equal(trust('203.0.113.7', 0), false);
  assert.deepEqual(trustProxySetting(undefined), ['loopback']);
  assert.equal(trustProxySetting('1'), 1);
  assert.throws(() => trustProxySetting('true'), /unsafe/);
});

test('every response carries a request id; a safe incoming id is kept', () => server({}, async (url) => {
  const generated = (await fetch(url + '/api/health')).headers.get('x-request-id');
  assert.match(generated ?? '', /^[0-9a-f-]{36}$/);
  assert.equal((await fetch(url + '/api/health', { headers: { 'X-Request-Id': 'trace-12345678' } })).headers.get('x-request-id'), 'trace-12345678');
  assert.notEqual((await fetch(url + '/api/health', { headers: { 'X-Request-Id': 'bad id <script>' } })).headers.get('x-request-id'), 'bad id <script>');
}));

test('Idempotency-Key replays a POST command instead of repeating it', () => server({}, async (url) => {
  const post = (body: unknown, key: string) => fetch(url + '/api/applications', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });
  const body = { companyInn: '0001000010', purpose: 'WORKING_CAPITAL', requestedAmount: 3_000_000, requestedTermMonths: 12 };
  const first = await post(body, 'create-application-1');
  const second = await post(body, 'create-application-1');
  assert.equal(first.status, 201); assert.equal(second.status, 201); assert.equal(second.headers.get('idempotent-replayed'), 'true');
  assert.equal((await first.json() as any).application.id, (await second.json() as any).application.id);
  const list = await (await fetch(url + '/api/applications?inn=0001000010')).json() as any;
  assert.equal(list.applications.length, 1, 'the command ran once');
  const reused = await post({ ...body, requestedAmount: 2_000_000 }, 'create-application-1');
  assert.equal(reused.status, 422); assert.equal((await reused.json() as any).code, 'IDEMPOTENCY_KEY_REUSED');
  assert.equal((await post(body, 'x')).status, 400);
}));

test('invalid JSON, oversized bodies and unknown routes use unified errors', () => server({}, async (url) => {
  for (const body of ['{', JSON.stringify({ companyInn: '0001000010', purposeDescription: 'x'.repeat(60000) })]) {
    const response = await fetch(url + '/api/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, 400); assert.equal((await response.json() as any).code, 'INVALID_INPUT');
  }
  const missing = await fetch(url + '/api/unknown');
  assert.equal(missing.status, 404); assert.deepEqual(await missing.json(), { error: 'Маршрут не найден.', code: 'NOT_FOUND' });
}));
