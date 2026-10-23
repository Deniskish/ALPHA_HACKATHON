// Synthetic demonstration data. Companies, products and source responses are fictional:
// INNs use the unassigned tax-office code 00, names carry the «Демо» prefix, products are not offers of any bank.
import type { Company, CreditProduct, CreditPurpose, DemoScenario, Financials } from './types';

export const SYNTHETIC_LABEL = 'Синтетические демонстрационные данные';

export const purposeLabels: Record<CreditPurpose, string> = {
  WORKING_CAPITAL: 'Пополнение оборотных средств',
  EQUIPMENT: 'Покупка оборудования',
  NEW_LOCATION: 'Открытие новой точки',
  EXPANSION: 'Расширение действующего бизнеса',
  INVESTMENT_PROJECT: 'Инвестиционный проект',
  REFINANCING: 'Рефинансирование долгов',
  YOUNG_BUSINESS: 'Развитие молодого бизнеса',
  OTHER: 'Другие цели бизнеса',
};

/**
 * Synthetic key rate, % per year. Product rates are keyRate + productMargin + riskPremium.
 * The value is a demo parameter (CREDIT_KEY_RATE), not a quote of the current Bank of Russia rate.
 */
export const DEFAULT_KEY_RATE = 16;

type ProductTemplate = Omit<CreditProduct, 'baseRate' | 'isSynthetic' | 'maxBusinessAgeMonths' | 'requiresExistingDebt'>
  & Partial<Pick<CreditProduct, 'maxBusinessAgeMonths' | 'requiresExistingDebt'>>;
const productTemplates: ProductTemplate[] = [
  {
    id: 'working-capital', name: 'Оборотный кредит',
    description: 'Пополнение оборотных средств: закупка сырья и товаров, зарплата, текущие платежи.',
    minAmount: 500_000, maxAmount: 10_000_000, minTermMonths: 3, maxTermMonths: 24, productMargin: 3.5,
    minBusinessAgeMonths: 12, purposes: ['WORKING_CAPITAL', 'OTHER'], requiredDocuments: ['BANK_STATEMENT'],
  },
  {
    id: 'investment', name: 'Инвестиционный кредит',
    description: 'Новая точка, расширение, инвестиционный проект или крупное оборудование с длительной окупаемостью.',
    minAmount: 1_000_000, maxAmount: 30_000_000, minTermMonths: 12, maxTermMonths: 60, productMargin: 1.5,
    minBusinessAgeMonths: 24, purposes: ['EQUIPMENT', 'NEW_LOCATION', 'EXPANSION', 'INVESTMENT_PROJECT'],
    requiredDocuments: ['BANK_STATEMENT', 'INVESTMENT_PLAN'],
  },
  {
    id: 'express', name: 'Экспресс-финансирование',
    description: 'Небольшая сумма на любые цели бизнеса с коротким сроком и минимальным набором документов.',
    minAmount: 100_000, maxAmount: 3_000_000, minTermMonths: 3, maxTermMonths: 12, productMargin: 7.9,
    minBusinessAgeMonths: 6, purposes: ['WORKING_CAPITAL', 'EQUIPMENT', 'NEW_LOCATION', 'EXPANSION', 'REFINANCING', 'YOUNG_BUSINESS', 'OTHER'],
    requiredDocuments: ['BANK_STATEMENT'],
  },
  {
    id: 'equipment', name: 'Финансирование оборудования',
    description: 'Покупка оборудования и техники по коммерческому предложению поставщика.',
    minAmount: 300_000, maxAmount: 10_000_000, minTermMonths: 6, maxTermMonths: 48, productMargin: 2.5,
    minBusinessAgeMonths: 12, purposes: ['EQUIPMENT'], requiredDocuments: ['BANK_STATEMENT', 'INVESTMENT_PLAN'],
  },
  {
    id: 'refinancing', name: 'Рефинансирование',
    description: 'Замена действующих кредитов одним с более длинным сроком и понятным платежом.',
    minAmount: 1_000_000, maxAmount: 20_000_000, minTermMonths: 12, maxTermMonths: 60, productMargin: 2.5,
    minBusinessAgeMonths: 24, purposes: ['REFINANCING'], requiredDocuments: ['BANK_STATEMENT', 'LOAN_AGREEMENT'],
    requiresExistingDebt: true,
  },
  {
    id: 'young-business', name: 'Развитие молодого бизнеса',
    description: 'Для действующего бизнеса младше двух лет: оборотные средства, оборудование, новая точка.',
    minAmount: 100_000, maxAmount: 2_000_000, minTermMonths: 6, maxTermMonths: 24, productMargin: 6.5,
    minBusinessAgeMonths: 6, maxBusinessAgeMonths: 24,
    purposes: ['YOUNG_BUSINESS', 'WORKING_CAPITAL', 'EQUIPMENT', 'NEW_LOCATION', 'EXPANSION'], requiredDocuments: ['BANK_STATEMENT'],
  },
];

/** Synthetic products priced from the key rate; margins and limits are demo values, not offers of any bank. */
export function buildProducts(keyRate = DEFAULT_KEY_RATE): CreditProduct[] {
  return productTemplates.map((product) => ({ maxBusinessAgeMonths: null, requiresExistingDebt: false, ...product,
    baseRate: Math.round((keyRate + product.productMargin) * 10) / 10, isSynthetic: true }));
}
export const creditProducts = buildProducts();

/** Registration date: fixed, or relative to "now" so a young business keeps its age in every demo run. */
type DateSpec = string | { monthsAgo: number };
export function resolveDate(spec: DateSpec, now: Date): string {
  if (typeof spec === 'string') return spec;
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - spec.monthsAgo, Math.min(now.getUTCDate(), 28)));
  return date.toISOString().slice(0, 10);
}

type SyntheticSource = {
  fns: { active: boolean; registrationDate: DateSpec; okved: string };
  bki: { activeDebt: number; overdueAmount: number; maxDaysOverdue: number; hasHistory: boolean; activeLoans: number; latePayments12m: number };
  /** null — the synthetic financial data source has no reporting for this company. */
  finance: Financials | null;
};

type SyntheticCompany = Omit<Company, 'updatedAt' | 'financials' | 'source' | 'isSynthetic' | 'registrationDate'> & {
  registrationDate: DateSpec; scenario: DemoScenario; sources: SyntheticSource;
};

const syntheticCompanies: SyntheticCompany[] = [
  {
    inn: '0001000010', name: 'ООО «Демо Хлебозавод»', legalForm: 'ООО', registrationDate: '2019-03-14',
    okved: '10.71', okvedTitle: 'Производство хлеба и мучных кондитерских изделий', region: 'Новосибирская область', employees: 42,
    relationship: 'client', scenario: 'APPROVED',
    bankProfile: { clientSince: '2019-04-02', monthlyTurnover: 4_100_000, products: ['Расчётный счёт', 'Зарплатный проект', 'Эквайринг'], accountMasked: '40702 •••• 1010' },
    demo: { scenario: 'APPROVED', title: 'Сценарий A — одобрение',
      description: 'Стабильная компания без просрочек запрашивает умеренную сумму.',
      need: { purpose: 'WORKING_CAPITAL', requestedAmount: 3_000_000, requestedTermMonths: 12 } },
    sources: {
      fns: { active: true, registrationDate: '2019-03-14', okved: '10.71' },
      bki: { activeDebt: 4_000_000, overdueAmount: 0, maxDaysOverdue: 0, hasHistory: true, activeLoans: 2, latePayments12m: 0 },
      finance: { revenue: 48_000_000, expenses: 39_600_000, profit: 8_400_000, currentDebt: 4_000_000, period: 2025 },
    },
  },
  {
    inn: '0002000020', name: 'ООО «Демо Техсервис»', legalForm: 'ООО', registrationDate: '2021-09-01',
    okved: '33.12', okvedTitle: 'Ремонт машин и оборудования', region: 'Республика Татарстан', employees: 18,
    relationship: 'client', scenario: 'COUNTER_OFFER',
    bankProfile: { clientSince: '2021-09-20', monthlyTurnover: 2_600_000, products: ['Расчётный счёт', 'Бизнес-карта'], accountMasked: '40702 •••• 2020' },
    demo: { scenario: 'COUNTER_OFFER', title: 'Сценарий B — встречное предложение',
      description: 'Надёжная компания запрашивает сумму, слишком большую относительно выручки.',
      need: { purpose: 'EQUIPMENT', requestedAmount: 15_000_000, requestedTermMonths: 36 } },
    sources: {
      fns: { active: true, registrationDate: '2021-09-01', okved: '33.12' },
      bki: { activeDebt: 3_000_000, overdueAmount: 0, maxDaysOverdue: 0, hasHistory: true, activeLoans: 1, latePayments12m: 0 },
      finance: { revenue: 30_000_000, expenses: 24_000_000, profit: 6_000_000, currentDebt: 3_000_000, period: 2025 },
    },
  },
  {
    inn: '0003000030', name: 'ООО «Демо Агро»', legalForm: 'ООО', registrationDate: '2022-05-20',
    okved: '01.13', okvedTitle: 'Выращивание овощей', region: 'Краснодарский край', employees: 9,
    relationship: 'client', scenario: 'NEEDS_INFO',
    bankProfile: { clientSince: '2025-11-10', monthlyTurnover: 1_350_000, products: ['Расчётный счёт'], accountMasked: '40702 •••• 3030' },
    demo: { scenario: 'NEEDS_INFO', title: 'Сценарий C — нужны данные',
      description: 'Клиент недавно перевёл счёт в банк: отчётности нет — банк попросит показатели и документ.',
      need: { purpose: 'WORKING_CAPITAL', requestedAmount: 2_000_000, requestedTermMonths: 12 } },
    sources: {
      fns: { active: true, registrationDate: '2022-05-20', okved: '01.13' },
      bki: { activeDebt: 500_000, overdueAmount: 0, maxDaysOverdue: 0, hasHistory: true, activeLoans: 1, latePayments12m: 0 },
      finance: null,
    },
  },
  {
    inn: '0004000040', name: 'ООО «Демо Ремстрой»', legalForm: 'ООО', registrationDate: '2020-02-10',
    okved: '43.39', okvedTitle: 'Производство прочих отделочных и завершающих работ', region: 'Московская область', employees: 25,
    relationship: 'client', scenario: 'REJECTED',
    bankProfile: { clientSince: '2020-03-01', monthlyTurnover: 980_000, products: ['Расчётный счёт', 'Овердрафт'], accountMasked: '40702 •••• 4040' },
    demo: { scenario: 'REJECTED', title: 'Сценарий D — отказ',
      description: 'Высокая долговая нагрузка и длительная просрочка по действующим кредитам.',
      need: { purpose: 'WORKING_CAPITAL', requestedAmount: 5_000_000, requestedTermMonths: 24 } },
    sources: {
      fns: { active: true, registrationDate: '2020-02-10', okved: '43.39' },
      bki: { activeDebt: 9_500_000, overdueAmount: 640_000, maxDaysOverdue: 97, hasHistory: true, activeLoans: 4, latePayments12m: 5 },
      finance: { revenue: 12_000_000, expenses: 11_600_000, profit: 400_000, currentDebt: 9_500_000, period: 2025 },
    },
  },
  {
    inn: '0005000050', name: 'ООО «Демо Кофейня»', legalForm: 'ООО', registrationDate: '2021-04-12',
    okved: '56.30', okvedTitle: 'Подача напитков', region: 'Санкт-Петербург', employees: 14,
    relationship: 'non_client', scenario: 'APPROVED', bankProfile: null,
    demo: { scenario: 'APPROVED', title: 'Сценарий E — не клиент банка',
      description: 'Кофейня открывает вторую точку. Банк не знает её оборотов: данные подтверждаются в анкете и документами.',
      need: { purpose: 'NEW_LOCATION', requestedAmount: 4_000_000, requestedTermMonths: 36 } },
    sources: {
      fns: { active: true, registrationDate: '2021-04-12', okved: '56.30' },
      bki: { activeDebt: 1_200_000, overdueAmount: 0, maxDaysOverdue: 0, hasHistory: true, activeLoans: 1, latePayments12m: 0 },
      finance: null,
    },
  },
  {
    inn: '0006000060', name: 'ООО «Демо Старт»', legalForm: 'ООО', registrationDate: { monthsAgo: 10 },
    okved: '47.91', okvedTitle: 'Торговля через интернет', region: 'Свердловская область', employees: 4,
    relationship: 'non_client', scenario: 'COUNTER_OFFER', bankProfile: null,
    demo: { scenario: 'COUNTER_OFFER', title: 'Сценарий F — молодой бизнес',
      description: 'Интернет-магазин работает меньше года: подходит продукт для молодого бизнеса, сумма будет скорректирована.',
      need: { purpose: 'YOUNG_BUSINESS', requestedAmount: 800_000, requestedTermMonths: 12 } },
    sources: {
      fns: { active: true, registrationDate: { monthsAgo: 10 }, okved: '47.91' },
      bki: { activeDebt: 0, overdueAmount: 0, maxDaysOverdue: 0, hasHistory: false, activeLoans: 0, latePayments12m: 0 },
      finance: null,
    },
  },
];

/** Declared figures a non-client enters in the questionnaire during the demo (shown as hints, never auto-applied to clients). */
export const demoDeclaredFinancials: Record<string, { revenue: number; expenses: number; currentDebt: number; activeLoans: number }> = {
  '0003000030': { revenue: 18_000_000, expenses: 13_200_000, currentDebt: 500_000, activeLoans: 1 },
  '0005000050': { revenue: 26_000_000, expenses: 21_300_000, currentDebt: 1_200_000, activeLoans: 1 },
  '0006000060': { revenue: 6_000_000, expenses: 5_100_000, currentDebt: 0, activeLoans: 0 },
};

export const syntheticSources: ReadonlyMap<string, SyntheticSource> = new Map(syntheticCompanies.map((c) => [c.inn, c.sources]));

export function syntheticCompanyRecords(now: Date): Company[] {
  return syntheticCompanies.map(({ sources, scenario: _scenario, registrationDate, ...company }) => ({
    ...company, registrationDate: resolveDate(registrationDate, now),
    // The bank knows financials of its clients only; non-clients confirm them in the questionnaire.
    financials: company.relationship === 'client' ? sources.finance : null,
    source: 'synthetic', isSynthetic: true, updatedAt: now.toISOString(),
  }));
}
