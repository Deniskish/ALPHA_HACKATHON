// Explanations of results. The deterministic text is always built; the optional LLM may rephrase it from the same
// structured context. Neither changes the decision. Context has no INN, company name or free-text description.
import { formatMonths, formatRub } from './finance';
import { outcomeLabels, purposeLabels } from './labels';
import type { Improvements } from './improvements';
import type { LlmAssistant } from './llm';
import type { CreditApplication, CreditDecision, CreditProduct, RiskAssessment, ScoringResult } from './types';

export type Explanation = { kind: 'decision' | 'improvements'; text: string; source: 'llm' | 'template'; model: string | null };

export function decisionContext(app: CreditApplication, decision: CreditDecision, product: CreditProduct | null,
  scoring: ScoringResult | null, risk: RiskAssessment | null) {
  return {
    decision: decision.outcome, decisionLabel: outcomeLabels[decision.outcome],
    purpose: app.purpose ? purposeLabels[app.purpose] : null, product: product?.name ?? null,
    requestedAmount: app.requestedAmount, requestedTermMonths: app.requestedTermMonths,
    offeredAmount: decision.offer?.amount ?? null, offeredTermMonths: decision.offer?.termMonths ?? null,
    rate: decision.offer?.rate ?? null, monthlyPayment: decision.offer?.monthlyPayment ?? null,
    score: scoring?.score ?? null, riskLevel: risk?.riskLevel ?? scoring?.riskLevel ?? null,
    positiveFactors: decision.reasons.filter((r) => r.kind === 'positive').map((r) => r.text),
    concerns: decision.reasons.filter((r) => r.kind !== 'positive').map((r) => r.text),
    requiredInfo: decision.requiredInfo.map((r) => r.text), nextAction: decision.nextAction,
  };
}

export function templateDecisionText(app: CreditApplication, decision: CreditDecision): string {
  const positive = decision.reasons.filter((r) => r.kind === 'positive').map((r) => r.text.toLowerCase());
  const concerns = decision.reasons.filter((r) => r.kind === 'warning' || r.kind === 'negative').map((r) => r.text.toLowerCase());
  const parts = [decision.summary];
  if (decision.outcome === 'COUNTER_OFFER' && decision.offer && app.requestedAmount)
    parts.push(`Вы запросили ${formatRub(app.requestedAmount)} на ${formatMonths(app.requestedTermMonths ?? 0)}; предложение — ${formatRub(decision.offer.amount)} на ${formatMonths(decision.offer.termMonths)} с платежом ${formatRub(decision.offer.monthlyPayment)} в месяц.`);
  if (positive.length) parts.push(`В пользу заявки: ${positive.slice(0, 3).join('; ')}.`);
  if (concerns.length) parts.push(`Что повлияло на условия: ${concerns.slice(0, 3).join('; ')}.`);
  parts.push(decision.nextAction);
  return parts.join(' ');
}

export function templateImprovementsText(improvements: Improvements): string {
  if (improvements.hardStop) return `${improvements.hardStop} ${improvements.recommendations[0]?.text ?? ''}`.trim();
  const best = improvements.scenarios.find((s) => s.outcome === 'APPROVED') ?? improvements.scenarios[0];
  const parts = ['Мы пересчитали заявку с другими параметрами по той же модели оценки.'];
  if (best) parts.push(`Ориентировочно лучший расчётный сценарий — ${formatRub(best.amount)} на ${formatMonths(best.termMonths)}: платёж ${formatRub(best.monthlyPayment)}, предварительный результат «${outcomeLabels[best.outcome].toLowerCase()}».`);
  if (improvements.recommendations.length) parts.push(`Что может улучшить параметры заявки: ${improvements.recommendations.slice(0, 3).map((r) => r.title.toLowerCase()).join('; ')}.`);
  parts.push('Это не обещание одобрения — решение будет принято после повторной подачи.');
  return parts.join(' ');
}

/** Phrases an LLM answer must not contain for a given outcome (it may not reverse the decision). */
export function forbiddenFor(outcome: CreditDecision['outcome']): RegExp | null {
  if (outcome === 'REJECTED') return /одобрен|одобрили|готовы выдать/i;
  if (outcome === 'APPROVED') return /отказ|не одобрен/i;
  return /гарантир|точно одобр/i;
}

export async function explain(kind: Explanation['kind'], template: string, context: Record<string, unknown>, forbidden: RegExp | null,
  llm: LlmAssistant | null): Promise<Explanation> {
  const text = llm?.enabled ? await llm.explain(kind, context, forbidden) : null;
  return text ? { kind, text, source: 'llm', model: llm!.model } : { kind, text: template, source: 'template', model: null };
}
