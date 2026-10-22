// Deterministic loan arithmetic shared by matching, scoring and the decision engine.

/** Monthly annuity payment, ₽, rounded to whole rubles. */
export function monthlyPayment(amount: number, annualRate: number, termMonths: number) {
  const r = annualRate / 100 / 12;
  if (r === 0) return Math.round(amount / termMonths);
  return Math.round(amount * r / (1 - (1 + r) ** -termMonths));
}

/** Largest principal whose annuity payment does not exceed the given monthly payment. */
export function affordablePrincipal(payment: number, annualRate: number, termMonths: number) {
  if (payment <= 0) return 0;
  const r = annualRate / 100 / 12;
  return r === 0 ? payment * termMonths : payment * (1 - (1 + r) ** -termMonths) / r;
}

export function roundDown(amount: number, step = 100_000) {
  return Math.max(0, Math.floor(amount / step) * step);
}

/** Full calendar months between a YYYY-MM-DD date and now; null for unknown or future dates. */
export function businessAgeMonths(registrationDate: string | null, now: Date): number | null {
  if (!registrationDate || !/^\d{4}-\d{2}-\d{2}$/.test(registrationDate)) return null;
  const registered = new Date(`${registrationDate}T00:00:00Z`);
  if (!Number.isFinite(registered.getTime()) || registered > now) return null;
  return (now.getUTCFullYear() - registered.getUTCFullYear()) * 12 + now.getUTCMonth() - registered.getUTCMonth()
    - (now.getUTCDate() < registered.getUTCDate() ? 1 : 0);
}

/** Amount with non-breaking spaces, so it never wraps inside the number: "2 500 000 ₽". */
export function formatRub(amount: number) {
  return `${Math.round(amount).toLocaleString('ru-RU').replace(/[\s\u202f]/g, '\u00a0')}\u00a0₽`;
}

const plural = (n: number, forms: [string, string, string]) =>
  forms[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];

/** "1 месяц", "24 месяца", "60 месяцев". */
export function formatMonths(n: number) {
  return `${n} ${plural(n, ['месяц', 'месяца', 'месяцев'])}`;
}

export function formatAge(months: number) {
  const years = Math.floor(months / 12), rest = months % 12;
  if (!years) return `${rest} ${plural(rest, ['месяц', 'месяца', 'месяцев'])}`;
  return `${years} ${plural(years, ['год', 'года', 'лет'])}${rest ? ` ${rest} ${plural(rest, ['месяц', 'месяца', 'месяцев'])}` : ''}`;
}
