// Post-decision support (simulation): loan account, schedule position and next opportunities.
// No payments, postings or real disbursements happen; everything is derived from the accepted offer.
import { businessAgeMonths, formatMonths, formatRub } from './finance';
import type { Company, CreditProduct, CreditPurpose, FinancingAccount } from './types';

export type Opportunity = { code: string; title: string; description: string; available: boolean; condition: string | null;
  /** Prefill for a new application. */
  purpose: CreditPurpose | null };

/** Principal left after k annuity payments. */
export function remainingPrincipal(amount: number, annualRate: number, payment: number, paid: number) {
  const r = annualRate / 100 / 12;
  if (r === 0) return Math.max(0, amount - payment * paid);
  const growth = (1 + r) ** paid;
  return Math.max(0, Math.round(amount * growth - payment * (growth - 1) / r));
}

function addMonths(iso: string, months: number) {
  const date = new Date(iso);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function opportunities(financing: FinancingAccount, product: CreditProduct | null, company: Company, now: Date): Opportunity[] {
  const age = businessAgeMonths(company.registrationDate, now) ?? 0;
  const enough = financing.paidInstallments >= 6;
  const list: Opportunity[] = [
    { code: 'LIMIT_INCREASE', title: 'Увеличение лимита', purpose: product?.purposes[0] ?? 'WORKING_CAPITAL', available: enough,
      description: 'После полугода платежей без просрочек можно запросить большую сумму на тех же условиях оценки.',
      condition: enough ? null : `Станет доступно после 6 платежей без просрочек (сейчас ${financing.paidInstallments})` },
    { code: 'ADDITIONAL_WORKING_CAPITAL', title: 'Дополнительное финансирование', purpose: 'WORKING_CAPITAL', available: true,
      description: 'Короткий оборотный кредит на сезонные закупки и кассовые разрывы.', condition: null },
    { code: 'REFINANCING', title: 'Рефинансирование', purpose: 'REFINANCING', available: (company.financials?.currentDebt ?? 0) > 0,
      description: 'Объединить другие кредиты бизнеса в один с понятным платежом.',
      condition: (company.financials?.currentDebt ?? 0) > 0 ? null : 'Если у бизнеса появятся другие кредиты' },
    { code: 'INVESTMENT', title: 'Новый инвестиционный кредит', purpose: 'INVESTMENT_PROJECT', available: age >= 24,
      description: 'Финансирование проекта с длительной окупаемостью: оборудование, расширение, новая точка.',
      condition: age >= 24 ? null : 'Для бизнеса старше 2 лет' },
  ];
  // Do not offer the same purpose the client has just financed as a "new" opportunity.
  return list.filter((o) => !(o.code === 'ADDITIONAL_WORKING_CAPITAL' && product?.id === 'working-capital'));
}

export function financingView(financing: FinancingAccount, product: CreditProduct | null, company: Company, now: Date) {
  const remaining = remainingPrincipal(financing.amount, financing.rate, financing.monthlyPayment, financing.paidInstallments);
  const repaid = financing.status === 'REPAID';
  return {
    ...financing, productName: product?.name ?? financing.productId, remainingPrincipal: repaid ? 0 : remaining,
    installmentsLeft: financing.termMonths - financing.paidInstallments,
    nextPayment: repaid ? null : { date: addMonths(financing.issuedAt, financing.paidInstallments + 1), amount: financing.monthlyPayment },
    summary: repaid ? 'Финансирование полностью погашено (симуляция).'
      : `Остаток ${formatRub(remaining)}, впереди ${formatMonths(financing.termMonths - financing.paidInstallments)} платежей.`,
    simulated: true as const,
    opportunities: opportunities(financing, product, company, now),
  };
}
