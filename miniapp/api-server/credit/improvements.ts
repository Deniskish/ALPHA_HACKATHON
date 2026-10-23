// «Как улучшить заявку»: what-if scenarios through the same evaluation pipeline (ML risk + scoring + decision),
// computed on the checks of the current submission and never stored. Results are estimates, not promises.
import { evaluate, type EvaluationInput } from './evaluation';
import { formatMonths, formatRub, monthlyPayment, roundDown } from './finance';
import { financialFacts } from './scoring';
import { PAYMENT_TO_PROFIT_LIMIT } from './matching';
import type { DecisionOutcome, RiskLevel } from './types';

export type ScenarioResult = {
  label: string;
  amount: number;
  termMonths: number;
  productId: string;
  monthlyPayment: number;
  /** Payment as a share of average monthly profit; null without profit data. */
  paymentToProfit: number | null;
  affordability: 'ok' | 'tight' | 'over' | 'unknown';
  score: number;
  scoreRiskLevel: RiskLevel;
  mlProbability: number | null;
  mlRiskLevel: RiskLevel | null;
  /** Indicative outcome; the real decision is made only after resubmission. */
  outcome: DecisionOutcome;
  offerAmount: number | null;
  current: boolean;
};
export type Recommendation = { code: string; title: string; text: string; effect: string };
export type Improvements = { disclaimer: string; current: ScenarioResult; scenarios: ScenarioResult[]; recommendations: Recommendation[]; hardStop: string | null };

const outcomeRank: Record<DecisionOutcome, number> = { APPROVED: 0, COUNTER_OFFER: 1, NEEDS_INFO: 2, REJECTED: 3 };

function run(input: EvaluationInput, amount: number, termMonths: number, label: string, current = false): ScenarioResult | null {
  const { product } = input;
  if (amount < product.minAmount || amount > product.maxAmount || termMonths < product.minTermMonths || termMonths > product.maxTermMonths) return null;
  const application = { ...input.application, requestedAmount: amount, requestedTermMonths: termMonths };
  const result = evaluate({ ...input, application });
  const rate = result.decision.offer?.rate ?? product.baseRate;
  const payment = monthlyPayment(amount, rate, termMonths);
  const profit = financialFacts(input.checks).profit;
  const share = profit && profit > 0 ? payment / (profit / 12) : null;
  return {
    label, amount, termMonths, productId: product.id, monthlyPayment: payment, paymentToProfit: share,
    affordability: share === null ? 'unknown' : share > PAYMENT_TO_PROFIT_LIMIT ? 'over' : share > PAYMENT_TO_PROFIT_LIMIT * 0.8 ? 'tight' : 'ok',
    score: result.score.score, scoreRiskLevel: result.score.riskLevel,
    mlProbability: result.risk?.probability ?? null, mlRiskLevel: result.risk?.riskLevel ?? null,
    outcome: result.decision.outcome, offerAmount: result.decision.offer?.amount ?? null, current,
  };
}

export function improvementScenarios(input: EvaluationInput): Improvements {
  const amount = input.application.requestedAmount!, term = input.application.requestedTermMonths!, product = input.product;
  const current = run(input, amount, term, 'Текущая заявка', true)!;
  const terms = [...new Set([term, Math.min(term + 12, product.maxTermMonths), product.maxTermMonths])];
  const candidates: ScenarioResult[] = [];
  for (const share of [0.9, 0.8, 0.7, 0.6])
    for (const t of terms) {
      const scenarioAmount = roundDown(amount * share, 100_000);
      if (scenarioAmount === amount && t === term) continue;
      const result = run(input, scenarioAmount, t, `${formatRub(scenarioAmount)} на ${formatMonths(t)}`);
      if (result) candidates.push(result);
    }
  if (term < product.maxTermMonths) {
    const longer = run(input, amount, product.maxTermMonths, `${formatRub(amount)} на ${formatMonths(product.maxTermMonths)}`);
    if (longer) candidates.push(longer);
  }
  // Best indicative outcome first, then the largest amount, then the shortest term.
  const unique = candidates.filter((c, i) => candidates.findIndex((o) => o.amount === c.amount && o.termMonths === c.termMonths) === i);
  unique.sort((a, b) => outcomeRank[a.outcome] - outcomeRank[b.outcome] || b.amount - a.amount || a.termMonths - b.termMonths);
  const scenarios = unique.slice(0, 5);

  const base = evaluate(input);
  const factor = (code: string) => base.score.factors.find((f) => f.code === code);
  const recommendations: Recommendation[] = [];
  const hardStop = base.decision.reasons.find((r) => r.kind === 'negative' && ['CRITICAL_OVERDUE', 'NO_PROFIT', 'COMPANY_INACTIVE', 'BUSINESS_TOO_YOUNG'].includes(r.code));
  if (factor('paymentDiscipline')?.effect === 'negative') recommendations.push({ code: 'PAY_OVERDUE', title: 'Погасите просроченную задолженность',
    text: 'Просрочка — главный фактор риска. После погашения и нескольких месяцев платежей без просрочек оценка платёжной дисциплины улучшится.',
    effect: 'Может снять основной стоп-фактор' });
  if (factor('debtLoad')?.effect === 'negative') recommendations.push({ code: 'REDUCE_DEBT', title: 'Снизьте текущую долговую нагрузку',
    text: 'Частичное погашение действующих кредитов или их рефинансирование уменьшит долю долгов в выручке.', effect: 'Может улучшить фактор «Долговая нагрузка»' });
  if (factor('requestedAmountToRevenue')?.effect === 'negative' || current.outcome === 'COUNTER_OFFER') recommendations.push({ code: 'SMALLER_AMOUNT',
    title: 'Уменьшите сумму или разделите финансирование на этапы', text: 'Сумма велика относительно выручки. Расчётные сценарии ниже показывают, как меняется результат.',
    effect: 'Может улучшить фактор «Сумма относительно выручки» и платёжеспособность' });
  if (current.affordability === 'over' || current.affordability === 'tight') recommendations.push({ code: 'LONGER_TERM', title: 'Увеличьте срок',
    text: `Платёж около ${Math.round((current.paymentToProfit ?? 0) * 100)}% среднемесячной прибыли при ориентире до ${Math.round(PAYMENT_TO_PROFIT_LIMIT * 100)}%. Более длинный срок снижает платёж.`,
    effect: 'Может улучшить платёжеспособность' });
  if (factor('profitability')?.effect === 'negative') recommendations.push({ code: 'PROFITABILITY', title: 'Подтвердите прибыльность',
    text: 'Приложите актуальную отчётность: если маржа выросла, оценка прибыльности будет выше.', effect: 'Может улучшить фактор «Прибыльность»' });
  if ((factor('applicationCompleteness')?.impact ?? 10) < (factor('applicationCompleteness')?.maxImpact ?? 10)) recommendations.push({ code: 'COMPLETE_FORM',
    title: 'Заполните анкету полностью', text: 'Укажите обязательства и кредитную историю, приложите бухгалтерскую отчётность — полнота учитывается в оценке.',
    effect: 'Может улучшить фактор «Полнота заявки»' });
  if (base.risk && base.risk.riskLevel !== 'LOW') recommendations.push({ code: 'ML_FACTORS', title: 'Обратите внимание на факторы модели риска',
    text: `Сильнее всего на оценку влияют: ${base.risk.topFactors.filter((f) => f.impact === 'negative').slice(0, 3).map((f) => f.label.toLowerCase()).join(', ') || 'общий профиль'}.`,
    effect: 'Может снизить расчётную вероятность трудностей с обслуживанием' });
  return {
    disclaimer: 'Расчётные сценарии и ориентировочный результат по демо-модели. Это не обещание одобрения: решение принимается после повторной подачи.',
    current, scenarios, recommendations,
    hardStop: hardStop ? `${hardStop.text}. Изменение суммы и срока само по себе этого не исправит.` : null,
  };
}
