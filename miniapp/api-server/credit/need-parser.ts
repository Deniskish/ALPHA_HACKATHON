// Deterministic parser of a free-text financing need («Хочу открыть вторую кофейню… около 4 млн рублей»).
// Always available; the optional LLM assistant may produce the same structure, which is validated against this contract.
import { purposeLabels } from './labels';
import type { CreditPurpose } from './types';

export type ParsedNeed = {
  purpose: CreditPurpose;
  amount: number | null;
  businessGoal: string;
  suggestedTerm: number;
  financingCategory: string;
  /** Which signals were recognised; empty means the text gave no hints. */
  recognized: ('purpose' | 'amount' | 'term')[];
  source: 'rules' | 'llm';
};

const purposeRules: [CreditPurpose, RegExp][] = [
  ['REFINANCING', /рефинанс|перекредит|погасить (?:другие |старые |текущие )?кредит|объединить кредит/i],
  ['NEW_LOCATION', /(?:открыть|открытие|запустить|ещё одн|втор(?:ую|ой|ая)|нов(?:ую|ый|ой)) .{0,30}(?:точк|кофейн|магазин|филиал|салон|кафе|ресторан|пекарн|офис|склад)|нов(?:ую|ая) точк/i],
  ['YOUNG_BUSINESS', /молод(?:ой|ому) бизнес|недавно (?:открыл|зарегистр)|работаем (?:меньше|недавно|полгода|год)|начинающ/i],
  ['EQUIPMENT', /оборудовани|станок|станк|техник[уи]|транспорт|автомобил|грузовик|печь|кофемашин/i],
  ['INVESTMENT_PROJECT', /инвестиц|проект|строительств|производственн(?:ую|ой) линию|цех/i],
  ['EXPANSION', /расшир|масштаб|увелич(?:ить|ение) (?:производств|объём|мощност)|нанять|новые направления/i],
  ['WORKING_CAPITAL', /оборот|закупк|товар|сырь|зарплат|кассов|сезон|поставщик/i],
];

const defaultTerms: Record<CreditPurpose, number> = {
  WORKING_CAPITAL: 12, EQUIPMENT: 36, NEW_LOCATION: 36, EXPANSION: 36, INVESTMENT_PROJECT: 48, REFINANCING: 36, YOUNG_BUSINESS: 12, OTHER: 12,
};
const categories: Record<CreditPurpose, string> = {
  WORKING_CAPITAL: 'Оборотное финансирование', EQUIPMENT: 'Финансирование оборудования', NEW_LOCATION: 'Инвестиционное финансирование',
  EXPANSION: 'Инвестиционное финансирование', INVESTMENT_PROJECT: 'Инвестиционное финансирование', REFINANCING: 'Рефинансирование',
  YOUNG_BUSINESS: 'Финансирование молодого бизнеса', OTHER: 'Экспресс-финансирование',
};

export function parseAmount(text: string): number | null {
  const normalized = text.replace(/ /g, ' ').toLowerCase();
  const scaled = normalized.match(/(\d+(?:[.,]\d+)?)\s*(млрд|млн|миллион\w*|mln|тыс\w*|т\.?\s?р)/);
  if (scaled) {
    const value = Number(scaled[1].replace(',', '.'));
    const unit = scaled[2];
    const factor = unit.startsWith('млрд') ? 1e9 : unit.startsWith('млн') || unit.startsWith('миллион') || unit === 'mln' ? 1e6 : 1e3;
    return Math.round(value * factor);
  }
  const plain = normalized.match(/(\d{1,3}(?:[ .]\d{3})+|\d{5,})\s*(?:₽|руб|р\b)?/);
  return plain ? Number(plain[1].replace(/[ .]/g, '')) : null;
}

export function parseTermMonths(text: string): number | null {
  const months = text.match(/(\d{1,3})\s*(?:мес|месяц)/i);
  if (months) return Number(months[1]);
  const years = text.match(/(\d{1,2}(?:[.,]5)?)\s*(?:год|года|лет)/i);
  if (years) return Math.round(Number(years[1].replace(',', '.')) * 12);
  if (/полгода/i.test(text)) return 6;
  return null;
}

export function parseNeed(text: string): ParsedNeed {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 1000);
  const match = purposeRules.find(([, rule]) => rule.test(clean));
  const purpose = match?.[0] ?? 'OTHER';
  const amount = parseAmount(clean), term = parseTermMonths(clean);
  const recognized: ParsedNeed['recognized'] = [];
  if (match) recognized.push('purpose');
  if (amount) recognized.push('amount');
  if (term) recognized.push('term');
  return {
    purpose, amount, suggestedTerm: term ?? defaultTerms[purpose], financingCategory: categories[purpose],
    businessGoal: clean ? clean.split(/(?<=[.!?])\s/)[0].slice(0, 300) : purposeLabels[purpose],
    recognized, source: 'rules',
  };
}
