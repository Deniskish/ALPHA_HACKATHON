// Optional LLM assistant over an OpenAI-compatible endpoint (local open-weight model via Ollama by default).
// It only rephrases structured results: it never decides, scores or computes money. Every answer is validated;
// on AI disabled, timeout, network error or invalid output the deterministic fallback is used.
import { creditPurposes, type CreditPurpose } from './types';
import { parseAmount, type ParsedNeed } from './need-parser';

export type LlmConfig = { enabled: boolean; baseUrl: string; apiKey: string | null; model: string; timeoutMs: number };
export type LlmStatus = { enabled: boolean; model: string | null; endpoint: 'local' | 'remote' | null; lastOutcome: 'ok' | 'fallback' | null; lastError: string | null };

export function llmConfigFromEnv(env: NodeJS.ProcessEnv): LlmConfig {
  return {
    enabled: env.AI_ENABLED === 'true',
    baseUrl: (env.LLM_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, ''),
    apiKey: env.LLM_API_KEY?.trim() || null,
    model: env.LLM_MODEL || 'qwen2.5:7b-instruct',
    timeoutMs: Math.min(60_000, Math.max(1_000, Number(env.LLM_TIMEOUT_MS) || 20_000)),
  };
}

/** Masks data that could identify a person or company before text leaves the process. */
export function maskPersonalData(text: string) {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g, '[телефон]')
    .replace(/\b\d{10}(?:\d{2})?\b/g, '[номер]');
}

/** Numbers in an LLM answer must come from the context (amounts and percents are not invented or recalculated). */
export function numbersAreGrounded(answer: string, context: unknown) {
  const allowed = new Set<number>();
  JSON.stringify(context).replace(/-?\d+(?:\.\d+)?/g, (n) => { allowed.add(Math.abs(Number(n))); return n; });
  const known = (value: number) => allowed.has(value) || [...allowed].some((a) => Math.abs(a - value) <= 0.5
    || Math.abs(a / 1e6 - value) < 1e-9 || Math.abs(a / 1e3 - value) < 1e-9 || Math.abs(a * 100 - value) <= 0.5);
  const text = answer.replace(/(\d)[\s\u00a0\u202f](?=\d{3}\b)/g, '$1');
  const found = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(%?)/g)];
  return found.every(([, raw, percent]) => {
    const value = Number(raw.replace(',', '.'));
    // Small bare numbers are months, counts and points; a percent or anything larger must be grounded.
    if (value < 100 && !percent) return true;
    return known(value);
  });
}

/** The cabinet speaks Russian: an answer mostly in another language is rejected. */
export function isRussian(text: string) {
  const letters = text.match(/\p{L}/gu) ?? [];
  const cyrillic = text.match(/\p{Script=Cyrillic}/gu) ?? [];
  return letters.length > 0 && cyrillic.length / letters.length >= 0.8;
}

export class LlmAssistant {
  private status: LlmStatus;
  constructor(private readonly config: LlmConfig, private readonly transport: typeof fetch = fetch) {
    this.status = { enabled: config.enabled, model: config.enabled ? config.model : null,
      endpoint: config.enabled ? /127\.0\.0\.1|localhost|ollama|::1/.test(config.baseUrl) ? 'local' : 'remote' : null, lastOutcome: null, lastError: null };
  }

  getStatus(): LlmStatus { return { ...this.status }; }
  get enabled() { return this.config.enabled; }
  get model() { return this.config.model; }

  private async chat(system: string, user: string, json = false): Promise<string | null> {
    if (!this.config.enabled) return null;
    try {
      const response = await this.transport(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.config.timeoutMs),
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
        body: JSON.stringify({ model: this.config.model, temperature: 0.2, max_tokens: 600, stream: false,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`LLM_HTTP_${response.status}`); }
      const data = await response.json() as { choices?: { message?: { content?: unknown } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('LLM_EMPTY');
      return content.trim();
    } catch (error) {
      this.status = { ...this.status, lastOutcome: 'fallback', lastError: error instanceof Error && error.name === 'TimeoutError' ? 'timeout'
        : error instanceof Error ? error.message.slice(0, 60) : 'unknown' };
      return null;
    }
  }

  private accepted(text: string | null) {
    this.status = { ...this.status, lastOutcome: text ? 'ok' : 'fallback', lastError: text ? null : this.status.lastError ?? 'invalid_response' };
    return text;
  }

  /** Free text → structure. The result must pass the same contract as the deterministic parser. */
  async parseNeed(text: string): Promise<ParsedNeed | null> {
    const answer = await this.chat(
      'Ты помогаешь банку понять потребность малого бизнеса в финансировании. Верни только JSON, тексты — на русском языке: ' +
      `{"purpose": одно из ${JSON.stringify(creditPurposes)}, "amount": число рублей или null, "businessGoal": краткая цель до 200 символов, ` +
      '"suggestedTerm": срок в месяцах 3..60, "financingCategory": короткое название категории}. Не придумывай сумму, если её нет в тексте.',
      maskPersonalData(text), true);
    if (!answer) return null;
    try {
      const value = JSON.parse(answer.replace(/^```(?:json)?\s*|\s*```$/g, '')) as Record<string, unknown>;
      const purpose = value.purpose as CreditPurpose;
      const amount = value.amount === null ? null : Number(value.amount);
      const term = Number(value.suggestedTerm);
      if (!creditPurposes.includes(purpose) || (amount !== null && (!Number.isFinite(amount) || amount < 10_000 || amount > 1e9))
        || !Number.isInteger(term) || term < 3 || term > 60 || typeof value.businessGoal !== 'string' || typeof value.financingCategory !== 'string'
        || !isRussian(value.businessGoal) || !isRussian(value.financingCategory)) return this.accepted(null) as null;
      // The model may not invent or recompute the amount: it must equal what the deterministic parser found in the text.
      if (amount !== parseAmount(text)) return this.accepted(null) as null;
      this.accepted('ok');
      return { purpose, amount, suggestedTerm: term, businessGoal: value.businessGoal.slice(0, 300), financingCategory: value.financingCategory.slice(0, 60),
        recognized: ['purpose', ...(amount ? ['amount' as const] : [])], source: 'llm' };
    } catch { return this.accepted(null) as null; }
  }

  /** Human explanation of an already computed result. Context is structured and contains no identifiers. */
  async explain(kind: 'decision' | 'improvements', context: Record<string, unknown>, forbidden: RegExp | null): Promise<string | null> {
    const answer = await this.chat(
      'Ты объясняешь предпринимателю результат кредитной заявки простым языком. Отвечай только на русском языке. Используй только факты из JSON. ' +
      'Не меняй решение, суммы, ставки и оценки, не придумывай новые цифры и условия, не обещай одобрение. ' +
      (kind === 'improvements' ? 'Объясни, что можно сделать, чтобы улучшить заявку; используй формулировки «расчётный сценарий», «ориентировочно», «может улучшить». '
        : 'Объясни, что произошло, почему и что делать дальше. ') + 'До 120 слов, без markdown.',
      JSON.stringify(context));
    if (!answer || answer.length < 40 || answer.length > 1500 || !isRussian(answer) || !numbersAreGrounded(answer, context)
      || (forbidden && forbidden.test(answer))) return this.accepted(null);
    return this.accepted(answer);
  }
}
