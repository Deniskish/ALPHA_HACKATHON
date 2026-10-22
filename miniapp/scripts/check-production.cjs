const assert = require('node:assert/strict');
(async () => {
  const origin = process.env.FRONTEND_URL || 'http://127.0.0.1:3000';
  const index = await fetch(origin, { signal: AbortSignal.timeout(10000) });
  assert.equal(index.status, 200, 'Frontend must respond');
  const html = await index.text();
  assert.doesNotMatch(html, /\/@vite\/|\/@react-refresh|\/src\/main\.tsx/, 'Development server must not be public');
  const asset = html.match(/src="(\/assets\/[^"\s]+\.js)"/)?.[1];
  assert.ok(asset, 'Built entry script must be present');
  const script = await fetch(new URL(asset, origin), { headers: { 'Accept-Encoding': 'gzip' }, signal: AbortSignal.timeout(10000) });
  assert.equal(script.status, 200);
  assert.equal(script.headers.get('content-encoding'), 'gzip', 'JS must be compressed');
  assert.match(script.headers.get('cache-control') || '', /immutable/);
  const health = await fetch(new URL('/api/health', origin), { signal: AbortSignal.timeout(10000) });
  assert.equal(health.status, 200);
  const api = await health.json();
  assert.equal(api.status, 'ok');
  assert.equal(api.credit?.demoCompanies, 4, 'Synthetic demo companies must be seeded');
  const products = await fetch(new URL('/api/credit/products', origin), { headers: { 'Accept-Encoding': 'gzip' }, signal: AbortSignal.timeout(15000) });
  assert.equal(products.status, 200, 'Credit products must be served without external services');
  assert.equal(products.headers.get('content-encoding'), 'gzip', 'API JSON must be compressed');
  assert.equal((await products.json()).products.length, 3);
  if (process.env.EXPECTED_RELEASE_SHA) {
    assert.equal(api.revision, process.env.EXPECTED_RELEASE_SHA, 'API must run the deployed commit');
    const version = await fetch(new URL('/version.json', origin), { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    assert.equal(version.status, 200);
    assert.equal(version.headers.get('cache-control'), 'no-store');
    assert.equal((await version.json()).revision, process.env.EXPECTED_RELEASE_SHA, 'Frontend must run the same commit');
  }
  console.log('PASS production entry, gzip, immutable assets, API proxy, seeded demo data and credit products');
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
