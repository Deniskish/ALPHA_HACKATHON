// Human reading of the server-side readiness: what is required vs. only desirable, and what exactly is left.
// The percentage alone was misleading («всё заполнено, а справа 90%»): optional items count towards completeness too.
import type { Readiness, ReadinessItem } from '../../api-server/credit/readiness';
import { MIN_DESCRIPTION_LENGTH } from '../../api-server/credit/readiness';

/** Questionnaire field (DOM id) that fixes a readiness item; used to scroll and focus from the checklist. */
export function fieldIdOf(code: string): string {
  if (code.startsWith('document:')) return `doc-${code.slice(9)}`;
  switch (code) {
    case 'purposeDescription': return 'field-description';
    case 'amount': return 'field-amount';
    case 'term': return 'field-term';
    case 'purpose': case 'product': return 'field-purpose';
    case 'declaredFinancials': return 'field-revenue';
    case 'obligations': return 'field-loans';
    case 'existingDebt': return 'field-debt';
    default: return 'section-company';
  }
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

/** Short name of an unfinished item for sentences like «Осталось: описание цели». */
export function itemTitle(item: ReadinessItem, description = ''): string {
  if (item.code === 'purposeDescription') {
    const length = description.trim().length;
    return length ? `описание цели — ещё ${MIN_DESCRIPTION_LENGTH - length} ${plural(MIN_DESCRIPTION_LENGTH - length, 'символ', 'символа', 'символов')}`
      : 'описание цели финансирования';
  }
  return item.label.replace(/^Условие продукта: /, '').replace(/^./, (c) => c.toLowerCase());
}

export type ReadinessSummary = {
  requiredDone: number; requiredTotal: number; optionalDone: number; optionalTotal: number;
  missingRequired: ReadinessItem[]; missingOptional: ReadinessItem[];
  ready: boolean; headline: string; detail: string;
};

export function readinessSummary(readiness: Readiness, description = ''): ReadinessSummary {
  const required = readiness.items.filter((i) => i.required), optional = readiness.items.filter((i) => !i.required);
  const missingRequired = required.filter((i) => !i.done), missingOptional = optional.filter((i) => !i.done);
  const n = missingRequired.length;
  const headline = n === 0 ? 'Всё обязательное заполнено'
    : n === 1 ? 'Осталось 1 обязательное поле' : `Осталось ${n} ${plural(n, 'обязательное поле', 'обязательных поля', 'обязательных полей')}`;
  const detail = n === 1 ? `Заполните ${itemTitle(missingRequired[0], description)}.`
    : n > 1 ? 'Пункты отмечены ниже и подсвечены в анкете.'
      : missingOptional.length ? `Заявку можно отправить. Ещё ${missingOptional.length} ${plural(missingOptional.length, 'желательный пункт', 'желательных пункта', 'желательных пунктов')} повысят полноту и оценку.`
        : 'Анкета заполнена полностью.';
  return { requiredDone: required.length - n, requiredTotal: required.length, optionalDone: optional.length - missingOptional.length,
    optionalTotal: optional.length, missingRequired, missingOptional, ready: n === 0, headline, detail };
}
