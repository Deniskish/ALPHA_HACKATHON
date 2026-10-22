// Synthetic demonstration data. Companies, products and source responses are fictional:
// INNs use the unassigned tax-office code 00, names carry the «Демо» prefix, products are not offers of any bank.
import type { Company, CreditProduct, CreditPurpose, DemoScenario, Financials } from './types';

export const SYNTHETIC_LABEL = 'Синтетические демонстрационные данные';

export const purposeLabels: Record<CreditPurpose, string> = {
  WORKING_CAPITAL: 'Пополнение оборотных средств',
  EQUIPMENT: 'Покупка оборудования',
  EXPANSION: 'Развитие и расширение бизнеса',
  REFINANCING: 'Рефинансирование долгов',
  OTHER: 'Другие цели бизнеса',
};

export const creditProducts: CreditProduct[] = [
  {
    id: 'working-capital', name: 'Оборотный кредит',
    description: 'Пополнение оборотных средств: закупка сырья и товаров, зарплата, текущие платежи.',
    minAmount: 500_000, maxAmount: 10_000_000, minTermMonths: 3, maxTermMonths: 24, baseRate: 19.5,
    minBusinessAgeMonths: 12, purposes: ['WORKING_CAPITAL', 'REFINANCING', 'OTHER'],
    requiredDocuments: ['BANK_STATEMENT'], isSynthetic: true,
  },
  {
    id: 'investment', name: 'Инвестиционный кредит',
    description: 'Покупка оборудования, расширение производства и другие вложения с длительной окупаемостью.',
    minAmount: 1_000_000, maxAmount: 30_000_000, minTermMonths: 12, maxTermMonths: 60, baseRate: 17.5,
    minBusinessAgeMonths: 24, purposes: ['EQUIPMENT', 'EXPANSION'],
    requiredDocuments: ['BANK_STATEMENT', 'INVESTMENT_PLAN'], isSynthetic: true,
  },
  {
    id: 'express', name: 'Экспресс-кредит',
    description: 'Небольшая сумма на любые цели бизнеса с коротким сроком и минимальным набором документов.',
    minAmount: 100_000, maxAmount: 3_000_000, minTermMonths: 3, maxTermMonths: 12, baseRate: 23.9,
    minBusinessAgeMonths: 6, purposes: ['WORKING_CAPITAL', 'EQUIPMENT', 'EXPANSION', 'REFINANCING', 'OTHER'],
    requiredDocuments: ['BANK_STATEMENT'], isSynthetic: true,
  },
];

type SyntheticSource = {
  fns: { active: boolean; registrationDate: string; okved: string };
  bki: { activeDebt: number; overdueAmount: number; maxDaysOverdue: number; hasHistory: boolean };
  /** null — the synthetic financial data source has no reporting for this company. */
  finance: Financials | null;
};

type SyntheticCompany = Omit<Company, 'updatedAt' | 'financials' | 'source' | 'isSynthetic'> & { scenario: DemoScenario; sources: SyntheticSource };

const syntheticCompanies: SyntheticCompany[] = [
  {
    inn: '0001000010', name: 'ООО «Демо Хлебозавод»', legalForm: 'ООО', registrationDate: '2019-03-14',
    okved: '10.71', okvedTitle: 'Производство хлеба и мучных кондитерских изделий', region: 'Новосибирская область', employees: 42,
    scenario: 'APPROVED',
    demo: { scenario: 'APPROVED', title: 'Сценарий A — одобрение',
      description: 'Стабильная компания без просрочек запрашивает умеренную сумму.',
      need: { purpose: 'WORKING_CAPITAL', requestedAmount: 3_000_000, requestedTermMonths: 12 } },
    sources: {
      fns: { active: true, registrationDate: '2019-03-14', okved: '10.71' },
      bki: { activeDebt: 4_000_000, overdueAmount: 0, maxDaysOverdue: 0, hasHistory: true },
      finance: { revenue: 48_000_000, expenses: 39_600_000, profit: 8_400_000, currentDebt: 4_000_000, period: 2025 },
    },
  },
  {
    inn: '0002000020', name: 'ООО «Демо Техсервис»', legalForm: 'ООО', registrationDate: '2021-09-01',
    okved: '33.12', okvedTitle: 'Ремонт машин и оборудования', region: 'Республика Татарстан', employees: 18,
    scenario: 'COUNTER_OFFER',
    demo: { scenario: 'COUNTER_OFFER', title: 'Сценарий B — встречное предложение',
      description: 'Надёжная компания запрашивает сумму, слишком большую относительно выручки.',
      need: { purpose: 'EQUIPMENT', requestedAmount: 15_000_000, requestedTermMonths: 36 } },
    sources: {
      fns: { active: true, registrationDate: '2021-09-01', okved: '33.12' },
      bki: { activeDebt: 3_000_000, overdueAmount: 0, maxDaysOverdue: 0, hasHistory: true },
      finance: { revenue: 30_000_000, expenses: 24_000_000, profit: 6_000_000, currentDebt: 3_000_000, period: 2025 },
    },
  },
  {
    inn: '0003000030', name: 'ООО «Демо Агро»', legalForm: 'ООО', registrationDate: '2022-05-20',
    okved: '01.13', okvedTitle: 'Выращивание овощей', region: 'Краснодарский край', employees: 9,
    scenario: 'NEEDS_INFO',
    demo: { scenario: 'NEEDS_INFO', title: 'Сценарий C — нужны данные',
      description: 'В источниках нет финансовой отчётности: банк попросит показатели и документ.',
      need: { purpose: 'WORKING_CAPITAL', requestedAmount: 2_000_000, requestedTermMonths: 12 } },
    sources: {
      fns: { active: true, registrationDate: '2022-05-20', okved: '01.13' },
      bki: { activeDebt: 500_000, overdueAmount: 0, maxDaysOverdue: 0, hasHistory: true },
      finance: null,
    },
  },
  {
    inn: '0004000040', name: 'ООО «Демо Ремстрой»', legalForm: 'ООО', registrationDate: '2020-02-10',
    okved: '43.39', okvedTitle: 'Производство прочих отделочных и завершающих работ', region: 'Московская область', employees: 25,
    scenario: 'REJECTED',
    demo: { scenario: 'REJECTED', title: 'Сценарий D — отказ',
      description: 'Высокая долговая нагрузка и длительная просрочка по действующим кредитам.',
      need: { purpose: 'WORKING_CAPITAL', requestedAmount: 5_000_000, requestedTermMonths: 24 } },
    sources: {
      fns: { active: true, registrationDate: '2020-02-10', okved: '43.39' },
      bki: { activeDebt: 9_500_000, overdueAmount: 640_000, maxDaysOverdue: 97, hasHistory: true },
      finance: { revenue: 12_000_000, expenses: 11_600_000, profit: 400_000, currentDebt: 9_500_000, period: 2025 },
    },
  },
];

export const syntheticSources: ReadonlyMap<string, SyntheticSource> = new Map(syntheticCompanies.map((c) => [c.inn, c.sources]));

export function syntheticCompanyRecords(now: Date): Company[] {
  return syntheticCompanies.map(({ sources, scenario: _scenario, ...company }) => ({
    ...company, financials: sources.finance, source: 'synthetic', isSynthetic: true, updatedAt: now.toISOString(),
  }));
}
