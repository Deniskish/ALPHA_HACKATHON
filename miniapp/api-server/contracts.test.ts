import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { Router } from 'express';
import { createApp } from './app';
import { creditRouter } from './credit/router';
import { companyDataRouter } from './company-data/router';
import { ApplicationService } from './credit/service';
import { CreditStore } from './credit/store';

const root = path.resolve(__dirname, '../..');
const spec = parse(readFileSync(path.join(root, 'openapi.yaml'), 'utf8'));
const checks = parse(readFileSync(path.join(root, 'DATA-API.yaml'), 'utf8'));

type Schema = Record<string, any>;
/** Minimal OpenAPI 3.0 schema check: $ref, allOf, nullable, type, enum, required, properties, items. */
function validate(value: unknown, schema: Schema, where: string): string[] {
  if (schema.$ref) return validate(value, spec.components.schemas[schema.$ref.split('/').pop()], where);
  if (value === null) return schema.nullable ? [] : [`${where}: null is not allowed`];
  const errors: string[] = [];
  if (schema.allOf) for (const part of schema.allOf) errors.push(...validate(value, part, where));
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${where}: ${JSON.stringify(value)} not in enum`);
  const type = schema.type;
  if (type === 'object' || schema.properties || schema.required) {
    if (typeof value !== 'object' || Array.isArray(value)) return [...errors, `${where}: expected object`];
    for (const key of schema.required ?? []) if (!Object.hasOwn(value as object, key)) errors.push(`${where}.${key}: required`);
    for (const [key, sub] of Object.entries(schema.properties ?? {}))
      if (Object.hasOwn(value as object, key)) errors.push(...validate((value as any)[key], sub as Schema, `${where}.${key}`));
  } else if (type === 'array') {
    if (!Array.isArray(value)) return [...errors, `${where}: expected array`];
    value.forEach((item, i) => errors.push(...validate(item, schema.items, `${where}[${i}]`)));
  } else if (type === 'integer' && !Number.isInteger(value)) errors.push(`${where}: expected integer`);
  else if (type === 'number' && typeof value !== 'number') errors.push(`${where}: expected number`);
  else if (type === 'string' && typeof value !== 'string') errors.push(`${where}: expected string`);
  else if (type === 'boolean' && typeof value !== 'boolean') errors.push(`${where}: expected boolean`);
  return errors;
}

function routes(router: Router, prefix: string) {
  return (router.stack as any[]).filter((layer) => layer.route).flatMap((layer) =>
    Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${prefix}${layer.route.path}`.replace(/:(\w+)/g, '{$1}')));
}

test('OpenAPI and DATA-API checks correspond to public runtime responses', async () => {
  assert.match(spec.openapi, /^3\./); assert.equal(checks.schemaVersion, '1.0'); assert.equal(checks.checks.length, 6);
  const server = createApp({ env: {} }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  try {
    for (const check of checks.checks) {
      const operation = spec.paths[check.path]?.[check.method.toLowerCase()];
      assert.ok(operation, check.path);
      const response = await fetch(`http://127.0.0.1:${address.port}${check.path}`, { method: check.method });
      assert.ok(check.expected.statusCodes.includes(response.status));
      const body = await response.json();
      for (const field of check.expected.requiredFields) assert.ok(Object.hasOwn(body as object, field), `${check.path}: ${field}`);
      assert.deepEqual(validate(body, operation.responses['200'].content['application/json'].schema, check.path), []);
    }
  } finally { await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }); }
});

test('every implemented route is documented in OpenAPI and every documented route exists', () => {
  const app = createApp({ env: {} });
  const service = new ApplicationService(new CreditStore());
  const implemented = [
    ...(app._router.stack as any[]).filter((layer) => layer.route).flatMap((layer) =>
      Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route.path}`)),
    ...routes(creditRouter(service), '/api'),
    ...routes(companyDataRouter(), '/api/company'),
  ].sort();
  const documented = Object.entries(spec.paths).flatMap(([route, item]: [string, any]) =>
    Object.keys(item).filter((key) => ['get', 'post', 'patch', 'put', 'delete'].includes(key)).map((method) => `${method.toUpperCase()} ${route}`)).sort();
  assert.deepEqual(implemented, documented);
  service.store.close();
});

test('live responses of a complete scenario match the documented schemas', async () => {
  // The validator itself must reject wrong shapes.
  assert.ok(validate({}, { $ref: '#/components/schemas/ApplicationView' }, 'x').some((e) => e.endsWith('application: required')));
  assert.ok(validate({ state: 'PAID' }, { type: 'object', properties: { state: { $ref: '#/components/schemas/ApplicationState' } } }, 'x').length);
  assert.ok(validate({ score: 1.5 }, { $ref: '#/components/schemas/ScoringResult' }, 'x').some((e) => /expected integer/.test(e)));
  const credit = new ApplicationService(new CreditStore());
  const server = createApp({ env: {}, credit }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as { port: number };
  const call = async (method: string, route: string, template: string, status: string, body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    assert.equal(String(response.status), status, `${method} ${route}`);
    const json = await response.json();
    let documented = spec.paths[template][method.toLowerCase()].responses[status];
    assert.ok(documented, `${method} ${template} does not document ${status}`);
    if (documented.$ref) documented = spec.components.responses[documented.$ref.split('/').pop()];
    const schema = documented.content['application/json'].schema;
    assert.deepEqual(validate(json, schema, `${method} ${template} ${status}`), []);
    return json as any;
  };
  try {
    await call('GET', '/api/credit/products?inn=0002000020&purpose=EQUIPMENT&amount=15000000&term=36', '/api/credit/products', '200');
    await call('GET', '/api/companies/0002000020', '/api/companies/{inn}', '200');
    await call('GET', '/api/companies/7707083893', '/api/companies/{inn}', '404');
    const created = await call('POST', '/api/applications', '/api/applications', '201',
      { companyInn: '0002000020', productId: 'investment', purpose: 'EQUIPMENT', requestedAmount: 15_000_000, requestedTermMonths: 36, purposeDescription: 'Покупка станков для расширения сервиса' });
    const id = created.application.id, item = '/api/applications/{id}';
    await call('POST', `/api/applications/${id}/submit`, `${item}/submit`, '422');
    await call('PATCH', `/api/applications/${id}`, item, '400', { requestedAmount: 'many' });
    for (const type of ['BANK_STATEMENT', 'INVESTMENT_PLAN'])
      await call('POST', `/api/applications/${id}/documents`, `${item}/documents`, '201', { type, fileName: `${type}.pdf`, mimeType: 'application/pdf', sizeBytes: 2048, textCharacters: null });
    await call('POST', `/api/applications/${id}/submit`, `${item}/submit`, '200');
    const processed = await call('POST', `/api/applications/${id}/process`, `${item}/process`, '200');
    assert.equal(processed.application.state, 'COUNTER_OFFER');
    await call('GET', `/api/applications/${id}/scoring`, `${item}/scoring`, '200');
    await call('GET', `/api/applications/${id}/decision`, `${item}/decision`, '200');
    await call('GET', `/api/applications/${id}/events`, `${item}/events`, '200');
    await call('POST', `/api/applications/${id}/sign`, `${item}/sign`, '409');
    await call('POST', `/api/applications/${id}/accept`, `${item}/accept`, '200');
    await call('POST', `/api/applications/${id}/sign`, `${item}/sign`, '200');
    await call('GET', `/api/applications/${id}`, item, '200');
    await call('GET', '/api/applications?inn=0002000020', '/api/applications', '200');
    await call('GET', '/api/bank/applications', '/api/bank/applications', '200');
    await call('GET', `/api/bank/applications/${id}`, '/api/bank/applications/{id}', '200');
    await call('GET', '/api/bank/applications/missing', '/api/bank/applications/{id}', '404');
  } finally { await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }); credit.store.close(); }
});

test('production modules never import synthetic fixtures and frontend controls do not use empty handlers', () => {
  function visit(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'tests', '.git'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.[cm]?[jt]sx?$/.test(file) && !file.endsWith('.test.ts')) {
        const content = readFileSync(file, 'utf8');
        assert.doesNotMatch(content, /(?:from|import|require)\s*\(?\s*['"][^'"]*(?:tests\/fixtures|demo-provider)/, file);
        assert.doesNotMatch(content, /on(?:Click|Submit)=\{\(\)\s*=>\s*\{\s*\}\}|href=['"]javascript:|href=['"]#['"]\s*\/>/, file);
      }
    }
  }
  visit(path.join(root, 'miniapp'));
});
