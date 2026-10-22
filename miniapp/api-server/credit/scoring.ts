// Deterministic, explainable scoring. The score is an input of the decision engine, not a credit decision.
// Thresholds are synthetic demo values, not a real bank model.
import { businessAgeMonths, formatAge } from './finance';
import type { ExternalCheck, RiskLevel, ScoringFactor } from './types';

export type ScoringInput = {
  requestedAmount: number;
  registrationDate: string | null;
  checks: Pick<ExternalCheck, 'provider' | 'status' | 'payload'>[];
  /** Share of filled readiness items, 0..1. */
  completeness: number;
  now: Date;
};
export type Score = { score: number; riskLevel: RiskLevel; dataComplete: boolean; factors: ScoringFactor[] };

type Band = [threshold: number, points: number];
/** Points of the first band whose threshold the value reaches (bands sorted from best). */
const atLeast = (value: number, bands: Band[]) => bands.find(([threshold]) => value >= threshold)?.[1] ?? 0;
const atMost = (value: number, bands: Band[]) => bands.find(([threshold]) => value <= threshold)?.[1] ?? 0;
const percent = (value: number) => `${Math.round(value * 100)}%`;

export const SCORING_WEIGHTS = {
  businessAge: 15, paymentDiscipline: 25, debtLoad: 20, requestedAmountToRevenue: 15, profitability: 15, applicationCompleteness: 10,
} as const;

export function riskLevel(score: number): RiskLevel {
  return score >= 75 ? 'LOW' : score >= 60 ? 'MEDIUM' : 'HIGH';
}

export function financialFacts(checks: ScoringInput['checks']) {
  const payload = (provider: ExternalCheck['provider']) => checks.find((c) => c.provider === provider && c.status !== 'NOT_FOUND')?.payload ?? null;
  const finance = payload('FINANCE'), bki = payload('BKI'), fns = payload('FNS');
  const revenue = finance && Number(finance.revenue) > 0 ? Number(finance.revenue) : null;
  const debt = finance || bki ? Math.max(Number(finance?.currentDebt ?? 0), Number(bki?.activeDebt ?? 0)) : null;
  return {
    revenue, profit: finance ? Number(finance.profit) : null, debt,
    bki: bki as { activeDebt: number; overdueAmount: number; maxDaysOverdue: number; hasHistory: boolean } | null,
    fns: fns as { active: boolean; registrationDate: string | null; okved: string } | null,
  };
}

export class ScoringEngine {
  score(input: ScoringInput): Score {
    const facts = financialFacts(input.checks);
    const factors: ScoringFactor[] = [];
    let dataComplete = true;
    const factor = (code: ScoringFactor['code'], title: string, impact: number, explanation: string, known = true) => {
      if (!known) dataComplete = false;
      const maxImpact = SCORING_WEIGHTS[code];
      factors.push({ code, title, impact, maxImpact, explanation,
        effect: impact >= maxImpact * 0.7 ? 'positive' : impact <= maxImpact * 0.3 ? 'negative' : 'neutral' });
    };

    const age = businessAgeMonths(facts.fns?.registrationDate ?? input.registrationDate, input.now);
    factor('businessAge', 'Срок работы бизнеса', age === null ? 0 : atLeast(age, [[60, 15], [36, 12], [24, 9], [12, 5], [6, 2]]),
      age === null ? 'Дата регистрации неизвестна' : `Компания работает ${formatAge(age)}`, age !== null);

    const bki = facts.bki;
    if (!bki) factor('paymentDiscipline', 'Платёжная дисциплина', 0, 'Нет сведений о кредитной истории', false);
    else if (!bki.hasHistory) factor('paymentDiscipline', 'Платёжная дисциплина', 15, 'Кредитной истории нет — фактор учтён нейтрально');
    else factor('paymentDiscipline', 'Платёжная дисциплина', bki.maxDaysOverdue === 0 && bki.overdueAmount === 0 ? 25
      : atMost(bki.maxDaysOverdue, [[5, 20], [30, 12], [59, 5]]),
    bki.maxDaysOverdue === 0 && bki.overdueAmount === 0 ? 'Просрочек по кредитам нет'
      : `Максимальная просрочка ${bki.maxDaysOverdue} дн., сумма просрочки ${bki.overdueAmount.toLocaleString('ru-RU')} ₽`);

    const { revenue, profit, debt } = facts;
    if (revenue === null) {
      factor('debtLoad', 'Долговая нагрузка', 0, 'Нет данных о выручке', false);
      factor('requestedAmountToRevenue', 'Сумма относительно выручки', 0, 'Нет данных о выручке', false);
      factor('profitability', 'Прибыльность', 0, 'Нет данных о прибыли', false);
    } else {
      const load = (debt ?? 0) / revenue;
      factor('debtLoad', 'Долговая нагрузка', atMost(load, [[0.15, 20], [0.3, 15], [0.5, 9], [0.8, 4]]),
        `Текущие долги составляют ${percent(load)} годовой выручки`);
      const share = input.requestedAmount / revenue;
      factor('requestedAmountToRevenue', 'Сумма относительно выручки', atMost(share, [[0.1, 15], [0.2, 12], [0.35, 8], [0.5, 4]]),
        `Запрошенная сумма — ${percent(share)} годовой выручки`);
      const margin = (profit ?? 0) / revenue;
      factor('profitability', 'Прибыльность', margin <= 0 ? 0 : atLeast(margin, [[0.2, 15], [0.12, 12], [0.06, 8], [0, 4]]),
        margin <= 0 ? 'Бизнес не показывает прибыль' : `Рентабельность по прибыли ${percent(margin)}`);
    }

    const completeness = Math.max(0, Math.min(1, input.completeness));
    factor('applicationCompleteness', 'Полнота заявки', Math.round(completeness * SCORING_WEIGHTS.applicationCompleteness),
      `Заполнено ${percent(completeness)} пунктов заявки`);

    const score = Math.max(0, Math.min(100, factors.reduce((sum, f) => sum + f.impact, 0)));
    return { score, riskLevel: riskLevel(score), dataComplete, factors };
  }
}
