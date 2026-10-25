import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { B2BNetworkGraph } from './B2BNetworkGraph';
import { analyzeCounterpartyEcosystem } from './ecosystem';

test('B2BNetworkGraph renders Flow mode static markup without throwing', () => {
  const html = renderToStaticMarkup(createElement(B2BNetworkGraph, {
    companyInn: '0001000010',
    companyName: 'ООО «Пекарня Урожай»',
    annualRevenue: 48_000_000,
    initialMode: 'flow',
  }));

  assert.match(html, /Цепочка поставок/);
  assert.match(html, /Карта связей/);
  assert.match(html, /Поставщики/);
  assert.match(html, /Покупатели/);
  assert.match(html, /ООО «Пекарня Урожай»/);
  assert.match(html, /Клиент Альфа-Банка/);
  assert.match(html, /\+12 баллов/);
  assert.match(html, /-1,5% к ставке/);
  assert.match(html, /op-flow-lane/);
});

test('B2BNetworkGraph renders Radial mode static markup without throwing', () => {
  const html = renderToStaticMarkup(createElement(B2BNetworkGraph, {
    companyInn: '0001000010',
    companyName: 'ООО «Пекарня Урожай»',
    annualRevenue: 48_000_000,
    initialMode: 'radial',
  }));

  assert.match(html, /viewBox="0 0 720 440"/);
  assert.match(html, /op-radial-applicant/);
  assert.match(html, /op-radial-node/);
  assert.match(html, /ООО «Пекарня Урожай»/);
  assert.match(html, /Федеральная сеть суперм/);
});

test('B2BNetworkGraph renders for SME with generic / external counterparties', () => {
  const html = renderToStaticMarkup(createElement(B2BNetworkGraph, {
    companyInn: '9999999999',
    companyName: 'ИП Иванов П.С.',
    annualRevenue: 10_000_000,
  }));

  assert.match(html, /ИП Иванов П\.С\./);
  assert.match(html, /Supply Chain Finance/);
  assert.ok(html.length > 500);
});
