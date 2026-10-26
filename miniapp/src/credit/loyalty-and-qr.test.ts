import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoyaltyTrack } from './LoyaltyTrack';
import { QrModal } from './QrModal';

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
