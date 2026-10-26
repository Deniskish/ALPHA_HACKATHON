import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoyaltyTrack } from './LoyaltyTrack';
import { QrModal } from './QrModal';
import { buildHandoffUrl, parseHandoffToken, type DemoSession } from './session';

test('LoyaltyTrack reflects initial state and unlocks discounts after 6 payments', () => {
  // Initial state (0 payments)
  const initialHtml = renderToStaticMarkup(createElement(LoyaltyTrack, {
    paidInstallments: 0,
    totalTermMonths: 12,
    baseRate: 19.5,
  }));
  assert.match(initialHtml, /19,5%/);
  assert.match(initialHtml, /Внесите ещё.*6.*платеж/);
  assert.doesNotMatch(initialHtml, /-0\.5% скидка/);

  // Silver tier (3 payments)
  const silverHtml = renderToStaticMarkup(createElement(LoyaltyTrack, {
    paidInstallments: 3,
    totalTermMonths: 12,
    baseRate: 19.5,
  }));
  assert.match(silverHtml, /Внесите ещё.*3.*платеж/);

  // Gold tier (6 payments -> discount -0.5%)
  const goldHtml = renderToStaticMarkup(createElement(LoyaltyTrack, {
    paidInstallments: 6,
    totalTermMonths: 12,
    baseRate: 19.5,
  }));
  assert.match(goldHtml, /19,0%/); // 19.5 - 0.5 = 19.0
  assert.match(goldHtml, /-0\.5% скидка/);
  assert.match(goldHtml, /Золотого уровня/);
});

test('QrModal renders valid SVG QR markup', () => {
  const modalHtml = renderToStaticMarkup(createElement(QrModal, { onClose: () => {} }));
  assert.match(modalHtml, /<svg/);
  assert.match(modalHtml, /Открыть на смартфоне/);
  assert.match(modalHtml, /QR-код для перехода на мобильную версию/);
  // Ensure real dark modules are rendered
  const rectMatches = modalHtml.match(/<rect /g) || [];
  assert.ok(rectMatches.length > 50, `Expected over 50 modules, got ${rectMatches.length}`);
});

test('Session handoff encodes and restores active company session perfectly', () => {
  const session: DemoSession = {
    relationship: 'client',
    company: {
      inn: '0001000010',
      name: 'ООО «Демо Хлебозавод»',
      ogrn: '1020000000010',
      registrationDate: '2019-03-14',
      legalForm: 'ООО',
      okved: '10.71',
      region: 'Новосибирская область',
      isSynthetic: true,
      syntheticLabel: 'Синтетические данные',
    },
    manual: null,
  };

  const handoffUrl = buildHandoffUrl(session, 'https://alfa.business-opora.ru/#/credit/applications/app-demo-001/decision');
  assert.match(handoffUrl, /\?s=/);
  assert.match(handoffUrl, /#\/credit\/applications\/app-demo-001\/decision/);

  // Parse token from handoff URL
  const searchParams = new URL(handoffUrl).searchParams;
  const token = searchParams.get('s');
  assert.ok(token);

  const restored = parseHandoffToken(token);
  assert.ok(restored);
  assert.equal(restored.company.inn, '0001000010');
  assert.equal(restored.company.name, 'ООО «Демо Хлебозавод»');
  assert.equal(restored.relationship, 'client');
});

test('Session handoff handles manual company input', () => {
  const manualSession: DemoSession = {
    relationship: 'non_client',
    company: {
      inn: '7701234567',
      name: 'ИП Воробьёв А.Н.',
      ogrn: '',
      registrationDate: '2022-05-10',
      legalForm: 'ИП',
      okved: '47.11',
      region: 'г. Москва',
      isSynthetic: false,
      syntheticLabel: null,
    },
    manual: {
      inn: '7701234567',
      name: 'ИП Воробьёв А.Н.',
      legalForm: 'ИП',
      registrationDate: '2022-05-10',
      okved: '47.11',
      region: 'г. Москва',
    },
  };

  const handoffUrl = buildHandoffUrl(manualSession, 'https://alfa.business-opora.ru/#/');
  const token = new URL(handoffUrl).searchParams.get('s');
  assert.ok(token);

  const restored = parseHandoffToken(token);
  assert.ok(restored);
  assert.equal(restored.company.inn, '7701234567');
  assert.equal(restored.company.name, 'ИП Воробьёв А.Н.');
  assert.equal(restored.relationship, 'non_client');
  assert.equal(restored.manual?.inn, '7701234567');
});
