// Completeness of an application before submission. The same rules drive READY_TO_SUBMIT,
// the server-side validation stage and the "application completeness" scoring factor.
import { productChecks } from './matching';
import { documentLabels } from './labels';
import type { ApplicationDocument, Company, CreditApplication, CreditProduct } from './types';

export type ReadinessGroup = 'company' | 'finance' | 'obligations' | 'history' | 'financing' | 'documents';
export type ReadinessItem = { code: string; label: string; done: boolean; required: boolean; hint?: string; group: ReadinessGroup };
export type Readiness = { ready: boolean; completeness: number; items: ReadinessItem[]; missing: ReadinessItem[] };

export const MIN_DESCRIPTION_LENGTH = 20;

export function applicationReadiness(app: CreditApplication, product: CreditProduct | null, company: Company,
  documents: ApplicationDocument[], now: Date): Readiness {
  // Non-clients: the bank has no turnover data, so figures and a statement are required up front.
  const nonClient = company.relationship === 'non_client';
  const items: ReadinessItem[] = [{ code: 'product', label: 'Выбран кредитный продукт', done: !!product, required: true, group: 'financing' }];
  if (product) {
    const checks = productChecks(product, company, {
      purpose: app.purpose ?? undefined, requestedAmount: app.requestedAmount ?? undefined, requestedTermMonths: app.requestedTermMonths ?? undefined,
    }, now, { debt: app.declaredFinancials?.currentDebt ?? null });
    for (const check of checks) items.push({ code: check.code, label: check.ok ? check.text : `Условие продукта: ${check.text.toLowerCase()}`, done: check.ok, required: true,
      group: check.code === 'businessAge' ? 'company' : check.code === 'existingDebt' ? 'obligations' : 'financing' });
    for (const type of product.requiredDocuments)
      items.push({ code: `document:${type}`, label: documentLabels[type], done: documents.some((d) => d.type === type), required: true,
        hint: 'Обязательный документ для этого продукта', group: 'documents' });
  }
  items.push({ code: 'purposeDescription', label: 'Описание цели финансирования', required: true,
    done: app.purposeDescription.trim().length >= MIN_DESCRIPTION_LENGTH, hint: `Не короче ${MIN_DESCRIPTION_LENGTH} символов`, group: 'financing' });
  items.push({ code: 'declaredFinancials', label: 'Финансовые показатели за последний год', required: nonClient,
    done: !!app.declaredFinancials, hint: nonClient ? 'Банк ещё не видит обороты компании' : 'Понадобятся, если в источниках нет отчётности', group: 'finance' });
  items.push({ code: 'obligations', label: 'Обязательства и кредитная история (по вашим данным)', required: false,
    done: app.declaredFinancials?.activeLoans !== undefined && !!app.declaredCreditHistory, hint: 'Сверяются с бюро кредитных историй', group: 'history' });
  items.push({ code: `document:FINANCIAL_STATEMENT`, label: documentLabels.FINANCIAL_STATEMENT, required: nonClient,
    done: documents.some((d) => d.type === 'FINANCIAL_STATEMENT'), hint: nonClient ? 'Подтверждает указанные показатели' : 'Ускоряет проверку и подтверждает показатели', group: 'documents' });
  const unique = items.filter((item, index) => items.findIndex((other) => other.code === item.code) === index);
  const missing = unique.filter((item) => item.required && !item.done);
  return { ready: missing.length === 0, completeness: unique.filter((item) => item.done).length / unique.length, items: unique, missing };
}
