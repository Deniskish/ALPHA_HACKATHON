import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOneCStatement, DEMO_1C_STATEMENT_RAW } from './one-c-parser';

test('parseOneCStatement successfully extracts headers, revenue, and expenses from 1C text', () => {
  const result = parseOneCStatement(DEMO_1C_STATEMENT_RAW);

  assert.equal(result.formatVersion, '1.03');
  assert.equal(result.account, '40702810500000054321');
  assert.equal(result.totalInflow, 26_000_000);
  assert.equal(result.totalOutflow, 21_300_000);
  assert.equal(result.netProfit, 4_700_000);
  assert.equal(result.monthlyBreakdown.length, 12);
  assert.ok(result.topCounterparties.length > 0);
  assert.match(result.summaryNote, /успешно проверена/);
});

test('parseOneCStatement handles fallback when section summary is missing', () => {
  const custom = `1CClientBankExchange
РасчСчет=40702810111122223333
СекцияДокумент=Платежное поручение
Сумма=500000.00
ДатаПоступило=10.05.2025
Плательщик1=ООО «Покупатель»
КонецДокумента
СекцияДокумент=Платежное поручение
Сумма=300000.00
ДатаСписано=12.05.2025
Получатель1=ООО «Поставщик»
КонецДокумента
КонецФайла`;

  const result = parseOneCStatement(custom);
  assert.equal(result.totalInflow, 500_000);
  assert.equal(result.totalOutflow, 300_000);
  assert.equal(result.netProfit, 200_000);
});
