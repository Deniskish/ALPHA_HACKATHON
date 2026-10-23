import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTransition, canTransition, transitionPath, transitions } from './state-machine';
import { applicationStates, CreditError } from './types';

test('every state has a transition list and only known targets', () => {
  assert.deepEqual(Object.keys(transitions).sort(), [...applicationStates].sort());
  for (const targets of Object.values(transitions))
    for (const target of targets) assert.ok(applicationStates.includes(target), target);
});

test('happy path DRAFT → ACTIVE_FINANCING is allowed step by step', () => {
  const path = ['DRAFT', 'DATA_COLLECTION', 'READY_TO_SUBMIT', 'SUBMITTED', 'VALIDATING', 'ENRICHING', 'RISK_ASSESSMENT', 'SCORING', 'DECISION',
    'APPROVED', 'OFFER_ACCEPTED', 'COMPLETED', 'ACTIVE_FINANCING'] as const;
  for (let i = 1; i < path.length; i++) assert.ok(canTransition(path[i - 1], path[i]), `${path[i - 1]} → ${path[i]}`);
});

test('decision can lead to all four outcomes, counter offer can be accepted', () => {
  for (const outcome of ['APPROVED', 'COUNTER_OFFER', 'NEEDS_INFO', 'REJECTED'] as const) assert.ok(canTransition('DECISION', outcome));
  assert.ok(canTransition('COUNTER_OFFER', 'OFFER_ACCEPTED'));
  assert.ok(canTransition('VALIDATING', 'NEEDS_INFO'));
});

test('NEEDS_INFO returns to data collection and can be submitted again', () => {
  assert.ok(canTransition('NEEDS_INFO', 'DATA_COLLECTION'));
  assert.ok(canTransition('NEEDS_INFO', 'READY_TO_SUBMIT'));
  assert.deepEqual(transitionPath('NEEDS_INFO', 'SUBMITTED'), ['READY_TO_SUBMIT', 'SUBMITTED']);
});

test('invalid transitions are rejected with INVALID_TRANSITION', () => {
  for (const [from, to] of [['DRAFT', 'SUBMITTED'], ['DRAFT', 'APPROVED'], ['SUBMITTED', 'APPROVED'], ['VALIDATING', 'SCORING'],
    ['REJECTED', 'DATA_COLLECTION'], ['COMPLETED', 'DRAFT'], ['APPROVED', 'REJECTED'], ['NEEDS_INFO', 'SUBMITTED'],
    ['ENRICHING', 'APPROVED']] as const) {
    assert.equal(canTransition(from, to), false, `${from} → ${to}`);
    assert.throws(() => assertTransition(from, to), (error: CreditError) => error.code === 'INVALID_TRANSITION' && error.status === 409);
  }
});

test('terminal states have no exits; transition paths follow only allowed edges', () => {
  assert.deepEqual(transitions.REJECTED, []); assert.deepEqual(transitions.ACTIVE_FINANCING, []);
  assert.deepEqual(transitions.COMPLETED, ['ACTIVE_FINANCING'], 'signing is followed only by a simulated issue');
  assert.deepEqual(transitionPath('DRAFT', 'READY_TO_SUBMIT'), ['DATA_COLLECTION', 'READY_TO_SUBMIT']);
  assert.deepEqual(transitionPath('SUBMITTED', 'DECISION'), ['VALIDATING', 'ENRICHING', 'RISK_ASSESSMENT', 'SCORING', 'DECISION']);
  assert.equal(canTransition('ENRICHING', 'SCORING'), false, 'risk assessment cannot be skipped');
  assert.equal(transitionPath('REJECTED', 'APPROVED'), null);
  assert.deepEqual(transitionPath('DRAFT', 'DRAFT'), []);
});
