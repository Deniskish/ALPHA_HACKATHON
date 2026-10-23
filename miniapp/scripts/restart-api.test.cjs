const test = require('node:test');
const assert = require('node:assert/strict');
const { restartApi } = require('./restart-api.cjs');
// The other project's processes share the PM2 daemon; they must be ignored, never deleted or restarted.
const neighbours = [{ name: 'opora-api', pm2_env: { DADATA_API_KEY: 'other-key', CREDIT_DB_PATH: '/opt/app/credit.sqlite' } },
  { name: 'opora-frontend', pm2_env: {} }];
test('replace a shell launcher with compiled API and preserve TLS/provider settings', () => {
  const calls = [];
  let verified = false;
  restartApi((file, args, options) => {
    assert.equal(file, 'pm2');
    calls.push(args[0]);
    if (args[0] === 'jlist') return JSON.stringify([...neighbours, { name: 'alfa-opora-api', pm2_env: { pm_exec_path: '/bin/bash', DADATA_API_KEY: 'test-key', NODE_EXTRA_CA_CERTS: '/certs/ca.pem', CREDIT_DB_PATH: '/data/credit.sqlite' } }]);
    assert.equal(verified, true);
    if (args[0] === 'delete') assert.deepEqual(args, ['delete', 'alfa-opora-api']);
    if (args[0] === 'start') {
      assert.match(args[1], /dist[/\\]server\.js$/);
      assert.equal(args[args.indexOf('--name') + 1], 'alfa-opora-api');
      assert.equal(options.env.DADATA_API_KEY, 'test-key');
      assert.equal(options.env.NODE_EXTRA_CA_CERTS, '/certs/ca.pem');
      assert.equal(options.env.CREDIT_DB_PATH, '/data/credit.sqlite');
      assert.equal(options.env.PORT, '3102');
      assert.equal(options.env.API_HOST, '127.0.0.1');
      assert.ok(!args.join(' ').includes('test-key'));
    }
  }, () => { verified = true; });
  assert.deepEqual(calls, ['jlist', 'delete', 'start']);
});
test('first start next to the other project: nothing is deleted and no settings are borrowed from it', () => {
  const calls = [];
  restartApi((_file, args, options) => {
    calls.push(args);
    if (args[0] === 'jlist') return JSON.stringify(neighbours);
    assert.notEqual(options.env.DADATA_API_KEY, 'other-key');
    assert.notEqual(options.env.CREDIT_DB_PATH, '/opt/app/credit.sqlite');
  }, () => {});
  assert.deepEqual(calls.map((args) => args[0]), ['jlist', 'start']);
  assert.equal(calls[1][calls[1].indexOf('--name') + 1], 'alfa-opora-api');
});
test('missing build never stops the running API', () => {
  const calls = [];
  assert.throws(() => restartApi((_file, args) => { calls.push(args[0]); return '[{"name":"alfa-opora-api","pm2_env":{}}]'; }, () => { throw new Error('missing build'); }), /missing build/);
  assert.deepEqual(calls, ['jlist']);
});
