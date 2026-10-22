// Product matching: which synthetic products fit the financing need and why.
import { businessAgeMonths, formatAge, formatRub, monthlyPayment } from './finance';
import { purposeLabels } from './labels';
import type { Company, CreditProduct, FinancingNeed } from './types';

export type ProductCheck = { code: 'purpose' | 'amount' | 'term' | 'businessAge'; ok: boolean; text: string };
export type ProductMatch = {
  product: CreditProduct;
  eligible: boolean;
  recommended: boolean;
  checks: ProductCheck[];
  /** Indicative payment at the base rate; the final rate is set by the decision. */
  estimatedMonthlyPayment: number | null;
};

export function productChecks(product: CreditProduct, company: Pick<Company, 'registrationDate'>, need: Partial<FinancingNeed>, now: Date): ProductCheck[] {
  const age = businessAgeMonths(company.registrationDate, now);
  const amount = need.requestedAmount, term = need.requestedTermMonths;
  return [
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
    { code: 'businessAge', ok: age !== null && age >= product.minBusinessAgeMonths,
      text: age === null ? 'Не указана дата регистрации бизнеса'
        : age >= product.minBusinessAgeMonths ? `Бизнес работает ${formatAge(age)} (нужно от ${formatAge(product.minBusinessAgeMonths)})`
        : `Бизнес работает ${formatAge(age)}, а нужно от ${formatAge(product.minBusinessAgeMonths)}` },
  ];
}

export function matchProducts(products: CreditProduct[], company: Pick<Company, 'registrationDate'>, need: Partial<FinancingNeed>, now: Date): ProductMatch[] {
  const matches = products.map((product) => {
    const checks = productChecks(product, company, need, now);
    const eligible = checks.every((check) => check.ok);
    return { product, eligible, recommended: false, checks,
      estimatedMonthlyPayment: eligible ? monthlyPayment(need.requestedAmount!, product.baseRate, need.requestedTermMonths!) : null };
  });
  // Eligible first; among them the lowest base rate, then the narrower (more specialised) product.
  matches.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.product.baseRate - b.product.baseRate
    || a.product.purposes.length - b.product.purposes.length);
  if (matches[0]?.eligible) matches[0].recommended = true;
  return matches;
}
