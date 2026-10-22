// Completeness of an application before submission. The same rules drive READY_TO_SUBMIT,
// the server-side validation stage and the "application completeness" scoring factor.
import { productChecks } from './matching';
import { documentLabels } from './labels';
import type { ApplicationDocument, Company, CreditApplication, CreditProduct } from './types';

export type ReadinessItem = { code: string; label: string; done: boolean; required: boolean; hint?: string };
export type Readiness = { ready: boolean; completeness: number; items: ReadinessItem[]; missing: ReadinessItem[] };

export const MIN_DESCRIPTION_LENGTH = 20;

export function applicationReadiness(app: CreditApplication, product: CreditProduct | null, company: Company,
  documents: ApplicationDocument[], now: Date): Readiness {
  const items: ReadinessItem[] = [{ code: 'product', label: 'Выбран кредитный продукт', done: !!product, required: true }];
  if (product) {
    const checks = productChecks(product, company, {
      purpose: app.purpose ?? undefined, requestedAmount: app.requestedAmount ?? undefined, requestedTermMonths: app.requestedTermMonths ?? undefined,
    }, now);
    for (const check of checks) items.push({ code: check.code, label: check.ok ? check.text : `Условие продукта: ${check.text.toLowerCase()}`, done: check.ok, required: true });
    for (const type of product.requiredDocuments)
      items.push({ code: `document:${type}`, label: documentLabels[type], done: documents.some((d) => d.type === type), required: true,
        hint: 'Обязательный документ для этого продукта' });
  }
  items.push({ code: 'purposeDescription', label: 'Описание цели финансирования', required: true,
    done: app.purposeDescription.trim().length >= MIN_DESCRIPTION_LENGTH, hint: `Не короче ${MIN_DESCRIPTION_LENGTH} символов` });
  items.push({ code: 'declaredFinancials', label: 'Финансовые показатели за последний год', required: false,
    done: !!app.declaredFinancials, hint: 'Понадобятся, если в источниках нет отчётности' });
  items.push({ code: `document:FINANCIAL_STATEMENT`, label: documentLabels.FINANCIAL_STATEMENT, required: false,
    done: documents.some((d) => d.type === 'FINANCIAL_STATEMENT'), hint: 'Ускоряет проверку и подтверждает показатели' });
  const unique = items.filter((item, index) => items.findIndex((other) => other.code === item.code) === index);
  const missing = unique.filter((item) => item.required && !item.done);
  return { ready: missing.length === 0, completeness: unique.filter((item) => item.done).length / unique.length, items: unique, missing };
}
