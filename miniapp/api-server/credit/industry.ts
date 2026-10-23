// OKVED → industry group. Risk indices are synthetic demo values shared with the ML dataset generator
// (ml/feature_spec.json); they are not statistics of any bank.
export const industries = {
  agriculture: { label: 'Сельское хозяйство', risk: 1.15, seasonal: true },
  manufacturing: { label: 'Производство', risk: 1.0, seasonal: false },
  construction: { label: 'Строительство и ремонт', risk: 1.3, seasonal: true },
  retail: { label: 'Торговля', risk: 1.1, seasonal: false },
  food_service: { label: 'Общепит', risk: 1.25, seasonal: false },
  transport: { label: 'Транспорт и логистика', risk: 1.1, seasonal: false },
  it: { label: 'IT и связь', risk: 0.9, seasonal: false },
  services: { label: 'Услуги', risk: 1.0, seasonal: false },
} as const;
export type Industry = keyof typeof industries;

export function industryOf(okved: string | null | undefined): Industry {
  const code = Number(String(okved ?? '').slice(0, 2));
  if (!Number.isFinite(code) || code <= 0) return 'services';
  if (code <= 3) return 'agriculture';
  if (code >= 10 && code <= 33) return 'manufacturing';
  if (code >= 41 && code <= 43) return 'construction';
  if (code >= 45 && code <= 47) return 'retail';
  if (code >= 55 && code <= 56) return 'food_service';
  if (code >= 49 && code <= 53) return 'transport';
  if (code >= 61 && code <= 63) return 'it';
  return 'services';
}
