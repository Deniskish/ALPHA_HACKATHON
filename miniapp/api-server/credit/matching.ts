// Product matching: which synthetic products fit the financing need and why. Besides amount, term and purpose
// it uses the business facts known before the questionnaire: age, revenue, profit, debt load, credit history,
// industry, existing obligations and affordability. The result is advisory; the decision engine decides later.
import { affordablePrincipal, businessAgeMonths, formatAge, formatMonths, formatRub, monthlyPayment, roundDown } from './finance';
import { industries, industryOf } from './industry';
import { purposeLabels } from './labels';
import { priceProduct, type Pricing } from './pricing';
import type { Company, CreditProduct, FinancingNeed, RiskLevel } from './types';

export type ProductCheck = { code: 'purpose' | 'amount' | 'term' | 'businessAge' | 'existingDebt'; ok: boolean; text: string };
/** Facts available at the matching step (bank data for clients, bureau check, numbers the applicant entered). */
export type MatchingFacts = {
  revenue: number | null;
  profit: number | null;
  debt: number | null;
  maxDaysOverdue: number | null;
  hasCreditHistory: boolean | null;
  /** Preliminary risk level from the deterministic scoring, used for the indicative risk premium. */
  riskLevel: RiskLevel | null;
  /** Where the financial facts come from, for "which data was used". */
  financeSource: 'bank' | 'declared' | 'none';
};
export type Affordability = {
  status: 'ok' | 'tight' | 'unaffordable' | 'unknown';
  paymentToProfit: number | null;
  /** Largest amount the business can service with this product at its maximum term. */
  maxAffordableAmount: number | null;
};
export type ProductMatch = {
  product: CreditProduct;
  eligible: boolean;
  recommended: boolean;
  checks: ProductCheck[];
  /** Indicative payment at the indicative rate; the final rate is set by the decision. */
  estimatedMonthlyPayment: number | null;
  pricing: Pricing;
  /** Indicative overpayment over the whole term, ₽. */
  totalCost: number | null;
  affordability: Affordability;
  fitReasons: string[];
  dataUsed: string[];
  constraints: string[];
  risks: string[];
  alternatives: string[];
};

export const PAYMENT_TO_PROFIT_LIMIT = 0.5;
export const DEBT_TO_REVENUE_LIMIT = 0.5;
const noFacts: MatchingFacts = { revenue: null, profit: null, debt: null, maxDaysOverdue: null, hasCreditHistory: null, riskLevel: null, financeSource: 'none' };

export function productChecks(product: CreditProduct, company: Pick<Company, 'registrationDate'>, need: Partial<FinancingNeed>, now: Date,
  facts: Pick<MatchingFacts, 'debt'> = noFacts): ProductCheck[] {
  const age = businessAgeMonths(company.registrationDate, now);
  const amount = need.requestedAmount, term = need.requestedTermMonths;
  const ageOk = age !== null && age >= product.minBusinessAgeMonths && (product.maxBusinessAgeMonths === null || age <= product.maxBusinessAgeMonths);
  const checks: ProductCheck[] = [
    { code: 'purpose', ok: !!need.purpose && product.purposes.includes(need.purpose),
      text: need.purpose && product.purposes.includes(need.purpose) ? `Подходит для цели «${purposeLabels[need.purpose]}»`
        : `Цель «${need.purpose ? purposeLabels[need.purpose] : 'не указана'}» не финансируется этим продуктом` },
    { code: 'amount', ok: !!amount && amount >= product.minAmount && amount <= product.maxAmount,
      text: !amount ? 'Сумма не указана' : amount > product.maxAmount ? `Сумма больше максимума продукта (${formatRub(product.maxAmount)})`
        : amount < product.minAmount ? `Сумма меньше минимума продукта (${formatRub(product.minAmount)})`
        : `Сумма в пределах ${formatRub(product.minAmount)} – ${formatRub(product.maxAmount)}` },
    { code: 'term', ok: !!term && term >= product.minTermMonths && term <= product.maxTermMonths,
      text: !term ? 'Срок не указан' : term >= product.minTermMonths && term <= product.maxTermMonths
        ? `Срок в пределах ${product.minTermMonths}–${product.maxTermMonths} мес.`
        : `Срок должен быть от ${product.minTermMonths} до ${product.maxTermMonths} мес.` },
    { code: 'businessAge', ok: ageOk,
      text: age === null ? 'Не указана дата регистрации бизнеса'
        : product.maxBusinessAgeMonths !== null && age > product.maxBusinessAgeMonths
          ? `Продукт для бизнеса младше ${formatAge(product.maxBusinessAgeMonths)}, а ваш работает ${formatAge(age)}`
          : ageOk ? `Бизнес работает ${formatAge(age)} (нужно от ${formatAge(product.minBusinessAgeMonths)})`
            : `Бизнес работает ${formatAge(age)}, а нужно от ${formatAge(product.minBusinessAgeMonths)}` },
  ];
  if (product.requiresExistingDebt)
    checks.push({ code: 'existingDebt', ok: facts.debt === null || facts.debt > 0,
      text: facts.debt === null ? 'Уточним действующие кредиты в анкете' : facts.debt > 0 ? `Есть действующие кредиты на ${formatRub(facts.debt)}` : 'Нет действующих кредитов для рефинансирования' });
  return checks;
}

function affordability(product: CreditProduct, amount: number, term: number, rate: number, facts: MatchingFacts): Affordability {
  if (facts.profit === null || facts.revenue === null) return { status: 'unknown', paymentToProfit: null, maxAffordableAmount: null };
  const capacity = Math.max(0, facts.profit / 12 * PAYMENT_TO_PROFIT_LIMIT);
  const debtRoom = Math.max(0, facts.revenue * DEBT_TO_REVENUE_LIMIT - (facts.debt ?? 0));
  const payment = monthlyPayment(amount, rate, term);
  const paymentToProfit = facts.profit > 0 ? payment / (facts.profit / 12) : null;
  const maxAffordableAmount = Math.min(product.maxAmount, debtRoom, roundDown(affordablePrincipal(capacity, rate, product.maxTermMonths)));
  const status = paymentToProfit === null || amount > debtRoom || paymentToProfit > PAYMENT_TO_PROFIT_LIMIT ? 'unaffordable'
    : paymentToProfit > PAYMENT_TO_PROFIT_LIMIT * 0.8 ? 'tight' : 'ok';
  return { status, paymentToProfit, maxAffordableAmount };
}

export function matchProducts(products: CreditProduct[], company: Pick<Company, 'registrationDate'> & Partial<Pick<Company, 'okved' | 'relationship'>>,
  need: Partial<FinancingNeed>, now: Date, facts: MatchingFacts = noFacts): ProductMatch[] {
  const industry = industries[industryOf(company.okved)];
  const matches = products.map((product): ProductMatch => {
    const checks = productChecks(product, company, need, now, facts);
    const eligible = checks.every((check) => check.ok);
    const pricing = priceProduct(product, facts.riskLevel === 'MEDIUM' || facts.riskLevel === 'HIGH' ? facts.riskLevel : 'LOW');
    const amount = need.requestedAmount, term = need.requestedTermMonths;
    const payment = amount && term ? monthlyPayment(amount, pricing.rate, term) : null;
    const afford = amount && term ? affordability(product, amount, term, pricing.rate, facts) : { status: 'unknown' as const, paymentToProfit: null, maxAffordableAmount: null };

    const dataUsed = [`Цель, сумма и срок: ${need.purpose ? purposeLabels[need.purpose] : '—'}, ${amount ? formatRub(amount) : '—'}, ${term ? formatMonths(term) : '—'}`,
      'Дата регистрации бизнеса', `Отрасль: ${industry.label}`, `Ключевая ставка (демо-параметр): ${pricing.keyRate}%`];
    if (facts.financeSource === 'bank') dataUsed.push('Выручка, прибыль и обороты по данным банка (синтетические)');
    if (facts.financeSource === 'declared') dataUsed.push('Выручка и прибыль, указанные вами (будут проверены)');
    if (facts.hasCreditHistory !== null) dataUsed.push('Кредитная история и текущие долги (предварительная проверка)');

    const constraints = [`Сумма ${formatRub(product.minAmount)} – ${formatRub(product.maxAmount)}`, `Срок ${product.minTermMonths}–${product.maxTermMonths} мес.`,
      `Бизнес не младше ${formatAge(product.minBusinessAgeMonths)}${product.maxBusinessAgeMonths ? ` и не старше ${formatAge(product.maxBusinessAgeMonths)}` : ''}`];
    if (product.requiresExistingDebt) constraints.push('Нужны действующие кредиты, которые рефинансируются');

    const fitReasons = checks.filter((c) => c.ok).map((c) => c.text);
    if (afford.status === 'ok') fitReasons.push(`Платёж около ${Math.round(afford.paymentToProfit! * 100)}% среднемесячной прибыли — комфортная нагрузка`);
    if (facts.maxDaysOverdue === 0 && facts.hasCreditHistory) fitReasons.push('Просрочек в кредитной истории нет');

    const risks: string[] = [];
    if (eligible && afford.status === 'unaffordable') risks.push(afford.paymentToProfit !== null && afford.paymentToProfit > PAYMENT_TO_PROFIT_LIMIT
      ? `Платёж превысит ${Math.round(PAYMENT_TO_PROFIT_LIMIT * 100)}% среднемесячной прибыли — сумму или срок, скорее всего, скорректируют`
      : 'Долговая нагрузка с новым кредитом превысит допустимую — сумму, скорее всего, скорректируют');
    if (eligible && afford.status === 'tight') risks.push('Платёж близок к предельной нагрузке на прибыль');
    if (eligible && afford.status === 'unknown') risks.push('Нет данных о выручке и прибыли — оценим нагрузку после анкеты');
    if (facts.maxDaysOverdue !== null && facts.maxDaysOverdue >= 60) risks.push('Длительная просрочка в кредитной истории — высокий риск отказа');
    else if (facts.maxDaysOverdue) risks.push('Были просрочки — ставка может быть выше');
    if (facts.revenue && facts.debt !== null && facts.debt / facts.revenue > 0.5) risks.push('Высокая текущая долговая нагрузка');
    if (industry.risk >= 1.2) risks.push(`Отрасль «${industry.label}» в демо-модели учитывается как более рискованная`);
    if (pricing.riskPremium) risks.push(`Ориентировочная надбавка за риск +${pricing.riskPremium} п.п.`);

    const alternatives: string[] = [];
    if (eligible && afford.status === 'unaffordable' && afford.maxAffordableAmount && afford.maxAffordableAmount >= product.minAmount)
      alternatives.push(`Расчётно доступно до ${formatRub(afford.maxAffordableAmount)} на ${formatMonths(product.maxTermMonths)}`);
    if (eligible && term && term < product.maxTermMonths && afford.status !== 'ok' && afford.status !== 'unknown')
      alternatives.push(`Более длинный срок (до ${product.maxTermMonths} мес.) снизит платёж`);
    return { product, eligible, recommended: false, checks, estimatedMonthlyPayment: eligible ? payment : null, pricing,
      totalCost: eligible && payment && term && amount ? payment * term - amount : null, affordability: afford,
      fitReasons, dataUsed, constraints, risks, alternatives };
  });
  // Eligible first; then affordable ones; then the lowest rate; then the narrower (more specialised) product.
  const affordRank = (m: ProductMatch) => m.affordability.status === 'unaffordable' ? 1 : 0;
  matches.sort((a, b) => Number(b.eligible) - Number(a.eligible) || affordRank(a) - affordRank(b)
    || a.pricing.rate - b.pricing.rate || a.product.purposes.length - b.product.purposes.length);
  if (matches[0]?.eligible) matches[0].recommended = true;
  // Ineligible products point to eligible alternatives.
  const eligibleNames = matches.filter((m) => m.eligible).map((m) => m.product.name);
  for (const match of matches) if (!match.eligible && eligibleNames.length) match.alternatives.push(`Подходит: ${eligibleNames.slice(0, 2).join(', ')}`);
  return matches;
}
