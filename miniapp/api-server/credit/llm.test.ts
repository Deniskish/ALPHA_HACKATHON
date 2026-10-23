import test from 'node:test';
import assert from 'node:assert/strict';
import { isRussian, LlmAssistant, llmConfigFromEnv, maskPersonalData, numbersAreGrounded } from './llm';
import { ApplicationService } from './service';
import { CreditStore } from './store';

type Call = { url: string; init: RequestInit };
/** Fake OpenAI-compatible endpoint: returns the given content or fails the given way. */
function endpoint(reply: string | Error | (() => never), calls: Call[] = []) {
  const transport = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'function') reply();
    return new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { transport, calls };
}
const enabled = (env: NodeJS.ProcessEnv = {}) => llmConfigFromEnv({ AI_ENABLED: 'true', ...env });
const context = { outcome: 'COUNTER_OFFER', requested: { amount: 15_000_000 }, offer: { amount: 9_900_000, termMonths: 60, rate: 17.5 } };

test('AI is off by default and an empty key is never sent', async () => {
  const config = llmConfigFromEnv({});
  assert.equal(config.enabled, false);
  assert.equal(config.model, 'qwen2.5:7b-instruct');
  const { transport, calls } = endpoint('{}');
  assert.equal(await new LlmAssistant(config, transport).explain('decision', context, null), null);
  assert.equal(calls.length, 0, 'disabled assistant makes no network calls');
  const fake = endpoint('Мы готовы предложить 9 900 000 ₽ на 60 месяцев по ставке 17.5% — это меньше запрошенной суммы.');
  await new LlmAssistant(enabled(), fake.transport).explain('decision', context, null);
  assert.equal((fake.calls[0].init.headers as Record<string, string>).Authorization, undefined);
});

test('a grounded Russian answer is accepted', async () => {
  const assistant = new LlmAssistant(enabled(), endpoint('Мы готовы предложить 9 900 000 ₽ на 60 месяцев по ставке 17.5% вместо 15 млн — так платёж будет посильным.').transport);
  assert.match(await assistant.explain('decision', context, null) ?? '', /9 900 000/);
  assert.equal(assistant.getStatus().lastOutcome, 'ok');
});

test('fallback on English, invented numbers, forbidden promises, errors and timeouts', async () => {
  const cases: [string, string | Error][] = [
    ['english', 'The lender offers 9,900,000 rubles for 60 months instead of the requested amount.'],
    ['invented amount', 'Мы готовы предложить 12 000 000 ₽ на 60 месяцев, это хороший вариант для бизнеса.'],
    ['invented percent', 'Предложено 66% от запрошенной суммы на 60 месяцев — так нагрузка будет ниже.'],
    ['promise', 'Ваша заявка гарантированно будет одобрена на 9 900 000 ₽ после повторной подачи документов.'],
    ['network', new Error('ECONNREFUSED')],
  ];
  for (const [name, reply] of cases) {
    const assistant = new LlmAssistant(enabled(), endpoint(reply).transport);
    assert.equal(await assistant.explain('decision', context, /гарантир/i), null, name);
    assert.equal(assistant.getStatus().lastOutcome, 'fallback', name);
  }
  const timeout = new LlmAssistant(enabled({ LLM_TIMEOUT_MS: '1000' }), endpoint(Object.assign(new Error('aborted'), { name: 'TimeoutError' })).transport);
  assert.equal(await timeout.explain('decision', context, null), null);
  assert.equal(timeout.getStatus().lastError, 'timeout');
});

test('numbers and language checks', () => {
  assert.ok(numbersAreGrounded('Ставка 17.5%, срок 60 месяцев, сумма 9 900 000 ₽ (9.9 млн)', context));
  assert.ok(!numbersAreGrounded('Это 50% от запрошенного', context));
  assert.ok(isRussian('Заявка одобрена на 3 000 000 ₽ (ИП, ООО)'));
  assert.ok(!isRussian('Your application was approved'));
});

test('personal data is masked before the text leaves the process', async () => {
  assert.equal(maskPersonalData('ИНН 770708389312, тел. +7 (912) 345-67-89, mail a.b@example.com'), 'ИНН [номер], тел. [телефон], mail [email]');
  const { transport, calls } = endpoint('{"purpose":"NEW_LOCATION","amount":4000000,"businessGoal":"Вторая кофейня","suggestedTerm":36,"financingCategory":"Новая точка"}');
  await new LlmAssistant(enabled(), transport).parseNeed('Вторая кофейня, ИНН 7707083893, нужно 4 млн');
  assert.doesNotMatch(String(calls[0].init.body), /7707083893/);
});

test('need parsing: the model may not change the amount, and recognised rule signals win', async () => {
  const text = 'Хочу открыть вторую кофейню, купить оборудование и сделать ремонт. Нужно около 4 млн рублей';
  const wrongAmount = new LlmAssistant(enabled(), endpoint('{"purpose":"NEW_LOCATION","amount":5000000,"businessGoal":"Вторая кофейня","suggestedTerm":36,"financingCategory":"Новая точка"}').transport);
  assert.equal(await wrongAmount.parseNeed(text), null);
  // Model answers EQUIPMENT for 6 months; the rules recognised a new location, so purpose and term come from the rules.
  const llm = new LlmAssistant(enabled(), endpoint('{"purpose":"EQUIPMENT","amount":4000000,"businessGoal":"Открытие второй кофейни с ремонтом","suggestedTerm":6,"financingCategory":"Оборудование"}').transport);
  const service = new ApplicationService(new CreditStore(), { llm });
  const need = await service.parseNeed(text);
  assert.equal(need.purpose, 'NEW_LOCATION'); assert.equal(need.amount, 4_000_000); assert.equal(need.suggestedTerm, 36);
  assert.equal(need.businessGoal, 'Открытие второй кофейни с ремонтом'); assert.equal(need.source, 'llm');
  service.store.close();
});

test('the full flow and explanations work with AI disabled (template fallback)', async () => {
  const service = new ApplicationService(new CreditStore());
  const { application } = await service.create({ companyInn: '0002000020', patch: { purpose: 'EQUIPMENT', requestedAmount: 15_000_000,
    requestedTermMonths: 36, productId: 'investment', purposeDescription: 'Покупка станков для расширения сервиса' } });
  for (const type of ['BANK_STATEMENT', 'INVESTMENT_PLAN'] as const)
    service.addDocument(application.id, { type, fileName: `${type}.pdf`, mimeType: 'application/pdf', sizeBytes: 100, textCharacters: 10 });
  service.submit(application.id);
  assert.equal(service.process(application.id).application.state, 'COUNTER_OFFER');
  for (const kind of ['decision', 'improvements'] as const) {
    const explanation = await service.explanation(application.id, kind);
    assert.equal(explanation.source, 'template'); assert.ok(isRussian(explanation.text)); assert.doesNotMatch(explanation.text, /гарантир/i);
  }
  assert.equal((await service.parseNeed('Нужно пополнить оборотные средства на 2 млн')).source, 'rules');
  service.store.close();
});
