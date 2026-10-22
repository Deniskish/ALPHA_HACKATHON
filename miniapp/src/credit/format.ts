// Formatting helpers for the client UI.
export { formatAge, formatRub, businessAgeMonths, monthlyPayment, formatMonths as months } from '../../api-server/credit/finance';

/** "3 000 000" from 3000000; empty string for null. */
export function groupDigits(value: number | null | undefined) {
  return value === null || value === undefined ? '' : Math.round(value).toLocaleString('ru-RU').replace(/[\u00a0\u202f]/g, ' ');
}

/** Digits typed by the user → integer, or null when empty. */
export function parseAmount(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

export function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—';
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
}


export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Что-то пошло не так. Повторите попытку.';
}
