import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CreditStore } from './store';
import { creditProducts, syntheticCompanyRecords } from './synthetic-data';
import type { CreditApplication } from './types';

const now = new Date('2026-10-01T09:00:00Z');
const draft = (id: string): Omit<CreditApplication, 'number'> => ({ id, companyInn: '0001000010', productId: null, state: 'DRAFT',
  purpose: null, purposeDescription: '', requestedAmount: null, requestedTermMonths: null, declaredFinancials: null, attempt: 0,
  version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), submittedAt: null, acceptedOffer: null });

test('seed is idempotent and keeps synthetic companies and products reproducible', () => {
  const store = new CreditStore();
  try {
    store.seed(syntheticCompanyRecords(now), creditProducts);
    store.seed(syntheticCompanyRecords(now), creditProducts);
    assert.equal(store.listDemoCompanies().length, 4);
    assert.deepEqual(store.listProducts().map((p) => p.id), ['working-capital', 'investment', 'express']);
    assert.equal(store.getCompany('0003000030')?.financials, null);
    assert.ok(store.listDemoCompanies().every((c) => c.isSynthetic && c.demo));
  } finally { store.close(); }
});

test('applications persist on disk with numbers, optimistic versions and ordered events', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'credit-store-')), file = path.join(dir, 'credit.sqlite');
  try {
    let store = new CreditStore(file);
    store.seed(syntheticCompanyRecords(now), creditProducts);
    const app = store.insertApplication(draft('app-1'));
    assert.match(app.number, /^CR-2026-\d{5}$/);
    const updated = store.updateApplication({ ...app, requestedAmount: 1_000_000 });
    assert.equal(updated.version, 2);
    assert.throws(() => store.updateApplication({ ...app, requestedAmount: 2_000_000 }), /CONCURRENT_APPLICATION_UPDATE/);
    store.addEvent({ applicationId: app.id, type: 'CREATED', toState: 'DRAFT', message: 'a', createdAt: now.toISOString() });
    store.addEvent({ applicationId: app.id, type: 'UPDATED', message: 'b', payload: { x: 1 }, createdAt: now.toISOString() });
    store.close();
    store = new CreditStore(file);
    assert.equal(store.getApplication(app.id)?.requestedAmount, 1_000_000);
    assert.deepEqual(store.listEvents(app.id).map((e) => [e.sequence, e.type]), [[1, 'CREATED'], [2, 'UPDATED']]);
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a failed transaction leaves no partial records', () => {
  const store = new CreditStore();
  try {
    store.seed(syntheticCompanyRecords(now), creditProducts);
    const app = store.insertApplication(draft('app-2'));
    assert.throws(() => store.transaction(() => {
      store.addEvent({ applicationId: app.id, type: 'UPDATED', message: 'lost', createdAt: now.toISOString() });
      throw new Error('boom');
    }), /boom/);
    assert.equal(store.listEvents(app.id).length, 0);
  } finally { store.close(); }
});
