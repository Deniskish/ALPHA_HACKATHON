// Demo credit decision logic, separate from scoring. All thresholds are synthetic and documented in
// docs/scoring-and-decision.md; this is not a real bank's credit policy.
import { affordablePrincipal, businessAgeMonths, formatMonths as months, formatRub, monthlyPayment, roundDown } from './finance';
import { documentLabels } from './labels';
import { priceProduct } from './pricing';
import { financialFacts, type Score } from './scoring';
import type { Readiness } from './readiness';
import type {
  ApplicationDocument, CreditApplication, CreditDecision, CreditProduct, DecisionReason, ExternalCheck, OfferTerms, RequiredInfo, RiskAssessment,
} from './types';

export const DECISION_POLICY = {
  approveScore: 75,
  counterOfferScore: 60,
  criticalOverdueDays: 60,
  /** Monthly payment must not exceed this share of average monthly profit. */
  paymentToProfit: 0.5,
  /** New plus existing debt must not exceed this share of annual revenue. */
  debtToRevenue: 0.5,
  /** Medium-risk applications get at most this share of the requested amount. */
  mediumRiskAmountShare: 0.8,
  amountStep: 100_000,
  /**
   * ML risk (separate model) can only make terms more cautious: at or above this probability an
   * otherwise approvable application gets a counter offer with medium-risk terms. It never approves or rejects on its own.
   */
  mlCautionProbability: 0.2,
} as const;

export type DecisionInput = {
  application: CreditApplication;
  product: CreditProduct;
  /** All products, used when a counter offer has to switch the product. */
  products: CreditProduct[];
  registrationDate: string | null;
  externalChecks: Pick<ExternalCheck, 'provider' | 'status' | 'payload'>[];
  scoringResult: Score;
  readiness: Readiness;
  documents: ApplicationDocument[];
  now: Date;
  /** Output of the ML risk model; optional so the engine works without it. */
  riskAssessment?: Pick<RiskAssessment, 'probability' | 'riskLevel'> | null;
};
export type Decision = Pick<CreditDecision, 'outcome' | 'offer' | 'reasons' | 'requiredInfo' | 'summary' | 'nextAction'>;


export class CreditDecisionEngine {
  constructor(private readonly policy = DECISION_POLICY) {}

  decide(input: DecisionInput): Decision {
    const { application, product, externalChecks, scoringResult, documents } = input;
    const amount = application.requestedAmount!, term = application.requestedTermMonths!;
    const facts = financialFacts(externalChecks);
    const status = (provider: ExternalCheck['provider']) => externalChecks.find((c) => c.provider === provider)?.status;

    // 1. Missing required information → NEEDS_INFO.
    const requiredInfo: RequiredInfo[] = input.readiness.missing.map((item) => ({ code: item.code, text: item.label }));
    if (status('FINANCE') === 'NOT_FOUND') {
      if (!application.declaredFinancials)
        requiredInfo.push({ code: 'DECLARED_FINANCIALS', field: 'declaredFinancials', text: 'Укажите выручку, расходы и текущую задолженность за последний год' });
      if (!documents.some((d) => d.type === 'FINANCIAL_STATEMENT'))
        requiredInfo.push({ code: 'FINANCIAL_STATEMENT', documentType: 'FINANCIAL_STATEMENT', text: `Приложите документ: ${documentLabels.FINANCIAL_STATEMENT.toLowerCase()}` });
    }
    if (status('FNS') === 'NOT_FOUND')
      requiredInfo.push({ code: 'REGISTRY_EXTRACT', documentType: 'REGISTRY_EXTRACT', text: `Приложите документ: ${documentLabels.REGISTRY_EXTRACT.toLowerCase()}` });
    if (requiredInfo.length) return {
      outcome: 'NEEDS_INFO', offer: null, requiredInfo,
      reasons: [{ code: 'MISSING_DATA', kind: 'info', text: status('FINANCE') === 'NOT_FOUND'
        ? 'Во внешних источниках не нашлось финансовой отчётности компании' : 'В заявке не хватает обязательных сведений' }],
      summary: 'Чтобы принять решение, нам нужно ещё немного информации.',
      nextAction: 'Дополните заявку по списку ниже и отправьте её повторно — проверка займёт несколько секунд.',
    };

    const reasons = [...this.factorReasons(scoringResult), ...this.consistencyReasons(input)];
    const rejected = (text: string, code: string, nextAction: string): Decision => ({
      outcome: 'REJECTED', offer: null, requiredInfo: [], reasons: [{ code, kind: 'negative', text }, ...reasons.filter((r) => r.kind !== 'positive')],
      summary: 'К сожалению, сейчас мы не можем одобрить финансирование.', nextAction,
    });

    // 2. Hard stops → REJECTED regardless of the score.
    if (facts.fns && facts.fns.active === false)
      return rejected('Компания не действует по данным реестра', 'COMPANY_INACTIVE', 'Финансирование доступно только действующим компаниям.');
    if (facts.bki && facts.bki.maxDaysOverdue >= this.policy.criticalOverdueDays)
      return rejected(`Есть просрочка по действующим кредитам более ${this.policy.criticalOverdueDays} дней`, 'CRITICAL_OVERDUE',
        'Погасите просроченную задолженность и подайте новую заявку не раньше чем через 3 месяца.');
    if (facts.profit !== null && facts.profit <= 0)
      return rejected('Бизнес не показывает прибыль, из которой можно погашать кредит', 'NO_PROFIT',
        'Подайте заявку снова, когда отчётность покажет устойчивую прибыль.');
    const age = businessAgeMonths(facts.fns?.registrationDate ?? input.registrationDate, input.now);
    if (age !== null && age < product.minBusinessAgeMonths)
      return rejected('Срок работы бизнеса меньше требований продукта', 'BUSINESS_TOO_YOUNG', 'Выберите продукт с меньшими требованиями к сроку работы.');

    // 3. Score thresholds.
    if (scoringResult.score < this.policy.counterOfferScore)
      return rejected(`Итоговая оценка заявки ${scoringResult.score} из 100 ниже порога ${this.policy.counterOfferScore}`, 'LOW_SCORE',
        'Снизьте долговую нагрузку или запросите меньшую сумму и подайте новую заявку.');

    // 4. Affordability: what the business can service. Medium risk comes from the score or, more cautiously, from the ML model.
    const mlCaution = !!input.riskAssessment && input.riskAssessment.probability >= this.policy.mlCautionProbability;
    const medium = scoringResult.score < this.policy.approveScore || mlCaution;
    const capacity = this.capacity(facts.revenue!, facts.profit!, facts.debt ?? 0);
    const terms = (candidate: CreditProduct) => this.bestTerms(candidate, amount, term, capacity, medium);
    const own = terms(product);
    if (own && !medium && own.amount === amount && own.termMonths === term) return {
      outcome: 'APPROVED', offer: own, requiredInfo: [], reasons,
      summary: `Мы готовы выдать ${formatRub(amount)} на ${months(term)} по ставке ${own.rate}% годовых.`,
      nextAction: 'Примите предложение, чтобы перейти к подписанию договора.',
    };
    const offer = own ?? input.products
      .filter((p) => p.id !== product.id && application.purpose && p.purposes.includes(application.purpose) && (age ?? 0) >= p.minBusinessAgeMonths)
      .map(terms).filter((t): t is OfferTerms => !!t).sort((a, b) => b.amount - a.amount)[0];
    if (!offer)
      return rejected('Платёжеспособность бизнеса не позволяет обслуживать даже минимальную сумму продукта', 'NOT_AFFORDABLE',
        'Запросите меньшую сумму или подайте заявку после роста прибыли.');

    const offerProduct = input.products.find((p) => p.id === offer.productId)!;
    const changes: DecisionReason[] = [];
    if (medium) changes.push(mlCaution && scoringResult.score >= this.policy.approveScore
      ? { code: 'ML_RISK_CAUTION', kind: 'warning', text: 'Модель оценки рисков видит повышенную вероятность трудностей с обслуживанием — предлагаем более осторожные условия' }
      : { code: 'MEDIUM_RISK', kind: 'warning', text: `Оценка заявки ${scoringResult.score} из 100 — предлагаем более осторожные условия` });
    if (offer.amount < amount) changes.push({ code: 'AMOUNT_REDUCED', kind: 'warning',
      text: `Сумма снижена до ${formatRub(offer.amount)}: платёж не должен превышать ${Math.round(this.policy.paymentToProfit * 100)}% среднемесячной прибыли, а все долги — ${Math.round(this.policy.debtToRevenue * 100)}% годовой выручки` });
    if (offer.termMonths !== term) changes.push({ code: 'TERM_CHANGED', kind: 'info', text: `Срок изменён на ${months(offer.termMonths)}, чтобы снизить ежемесячный платёж` });
    if (offer.productId !== product.id) changes.push({ code: 'PRODUCT_CHANGED', kind: 'info', text: `Предлагаем другой продукт — «${offerProduct.name}»` });
    return {
      outcome: 'COUNTER_OFFER', offer, requiredInfo: [], reasons: [...reasons, ...changes],
      summary: `Мы готовы предложить ${formatRub(offer.amount)} на ${months(offer.termMonths)} вместо запрошенных ${formatRub(amount)} на ${months(term)}.`,
      nextAction: 'Примите встречное предложение или создайте новую заявку с другими параметрами.',
    };
  }

  private capacity(revenue: number, profit: number, debt: number) {
    return { payment: Math.max(0, profit / 12 * this.policy.paymentToProfit), debtRoom: Math.max(0, revenue * this.policy.debtToRevenue - debt) };
  }

  /** Largest affordable amount (≤ requested) and the shortest term ≥ requested that makes it affordable. */
  private bestTerms(product: CreditProduct, amount: number, term: number, capacity: { payment: number; debtRoom: number }, medium: boolean): OfferTerms | null {
    const pricing = priceProduct(product, medium ? 'MEDIUM' : 'LOW'), rate = pricing.rate;
    const minTerm = Math.min(Math.max(term, product.minTermMonths), product.maxTermMonths);
    const ceiling = Math.min(amount * (medium ? this.policy.mediumRiskAmountShare : 1), product.maxAmount, capacity.debtRoom,
      affordablePrincipal(capacity.payment, rate, product.maxTermMonths));
    const offered = ceiling >= amount ? amount : roundDown(ceiling, this.policy.amountStep);
    if (offered < product.minAmount) return null;
    let months = minTerm;
    while (months < product.maxTermMonths && affordablePrincipal(capacity.payment, rate, months) < offered) months++;
    return { productId: product.id, amount: offered, termMonths: months, rate, monthlyPayment: monthlyPayment(offered, rate, months),
      pricing: { keyRate: pricing.keyRate, productMargin: pricing.productMargin, riskPremium: pricing.riskPremium } };
  }

  /** Self-reported obligations and credit history compared with the bureau; informs, never decides. */
  private consistencyReasons(input: DecisionInput): DecisionReason[] {
    const bki = financialFacts(input.externalChecks).bki, declared = input.application.declaredCreditHistory;
    const reasons: DecisionReason[] = [];
    if (bki?.hasHistory && declared && !declared.hadOverdue12m && bki.maxDaysOverdue > 0)
      reasons.push({ code: 'DECLARED_HISTORY_MISMATCH', kind: 'warning', text: 'В анкете не указаны просрочки, но они есть в кредитной истории' });
    const loans = input.application.declaredFinancials?.activeLoans;
    if (bki?.hasHistory && loans !== undefined && bki.activeLoans !== undefined && loans < bki.activeLoans)
      reasons.push({ code: 'DECLARED_LOANS_MISMATCH', kind: 'info', text: 'В кредитной истории больше действующих кредитов, чем указано в анкете' });
    return reasons;
  }

  private factorReasons(score: Score): DecisionReason[] {
    return score.factors.filter((f) => f.effect !== 'neutral').map((f) => ({
      code: `FACTOR_${f.code}`, kind: f.effect === 'positive' ? 'positive' : 'warning', text: f.explanation,
    }));
  }
}
