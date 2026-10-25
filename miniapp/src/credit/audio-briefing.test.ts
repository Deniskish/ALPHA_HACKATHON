import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBriefingText } from './AudioBriefing';
import type { BankView } from './api';

test('generateBriefingText forms an authoritative report for approved application', () => {
  const mockView: any = {
    application: { id: 'app-1', number: 'CR-2026-00001', requestedAmount: 3_000_000, requestedTermMonths: 12 },
    company: { name: 'ООО «Демо Хлебозавод»', inn: '0001000010' },
    product: { name: 'Оборотный' },
    scoring: { score: 95 },
    riskAssessment: { probability: 0.005 },
    decision: {
      outcome: 'APPROVED',
      offer: { amount: 3_000_000, termMonths: 12, rate: 19.5 },
      reasons: [],
    },
  };

  const text = generateBriefingText(mockView as BankView);
  assert.match(text, /члены кредитного комитета/);
  assert.match(text, /ООО «Демо Хлебозавод»/);
  assert.match(text, /3\s*000\s*000\s*₽/);
  assert.match(text, /полное одобрение/);
  assert.match(text, /19,5 процента/);
});

test('generateBriefingText handles counter-offer reasoning', () => {
  const mockView: any = {
    application: { id: 'app-2', number: 'CR-2026-00002', requestedAmount: 15_000_000, requestedTermMonths: 36 },
    company: { name: 'ООО «Демо Техсервис»', inn: '0002000020' },
    product: { name: 'Оборудование' },
    scoring: { score: 87 },
    riskAssessment: { probability: 0.013 },
    decision: {
      outcome: 'COUNTER_OFFER',
      offer: { amount: 9_900_000, termMonths: 60, rate: 17.5 },
      reasons: [],
    },
  };

  const text = generateBriefingText(mockView as BankView);
  assert.match(text, /встречное предложение/);
  assert.match(text, /9\s*900\s*000\s*₽/);
  assert.match(text, /Запрошенный платёж превышал безопасный лимит/);
});
