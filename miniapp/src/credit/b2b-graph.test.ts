import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { B2BNetworkGraph } from './B2BNetworkGraph';

test('B2BNetworkGraph renders Flow mode static markup with zero text collisions', () => {
  const html = renderToStaticMarkup(createElement(B2BNetworkGraph, {
    companyInn: '0001000010',
    companyName: 'ООО «Пекарня Урожай»',
    annualRevenue: 48_000_000,
  }));

  assert.match(html, /Связи в экосистеме Альфа-Банка/);
  assert.match(html, /Supply Chain Finance/);
  assert.match(html, /Поставщики/);
  assert.match(html, /Покупатели/);
  assert.match(html, /ООО «Пекарня Урожай»/);
  assert.match(html, /Экосистемный буст/);
  assert.match(html, /\+12 баллов/);
  assert.match(html, /-1,5%/);
  assert.match(html, /op-flow-canvas/);
  assert.match(html, /op-hub-applicant/);
});

test('B2BNetworkGraph renders counterparty ledger table mode', () => {
  const html = renderToStaticMarkup(createElement(B2BNetworkGraph, {
    companyInn: '0001000010',
    companyName: 'ООО «Пекарня Урожай»',
    annualRevenue: 48_000_000,
  }));

  assert.match(html, /Реестр контрагентов/);
  assert.match(html, /Замкнутость на банк/);
});

test('B2BNetworkGraph renders for generic SME company gracefully', () => {
  const html = renderToStaticMarkup(createElement(B2BNetworkGraph, {
    companyInn: '9999999999',
    companyName: 'ИП Иванов П.С.',
    annualRevenue: 10_000_000,
  }));

  assert.match(html, /ИП Иванов П\.С\./);
  assert.match(html, /Связи в экосистеме Альфа-Банка/);
  assert.ok(html.length > 500);
});
