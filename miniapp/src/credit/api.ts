// Typed client of the credit API. View types come from the server service, so both sides stay in sync.
import type { ApplicationService } from '../../api-server/credit/service';
import type { MatchingFacts, ProductMatch } from '../../api-server/credit/matching';
import type { ParsedNeed } from '../../api-server/credit/need-parser';
import type { Improvements } from '../../api-server/credit/improvements';
import type { Explanation as ExplanationView } from '../../api-server/credit/explanations';
export type { Improvements, ExplanationView };
import type { ApplicationPatch } from '../../api-server/credit/service';
import type { Company, CreditProduct, CreditPurpose, DocumentType } from '../../api-server/credit/types';

export type ApplicationView = ReturnType<ApplicationService['view']>;
export type ProcessedView = ApplicationView & { replayed?: boolean };
export type BankView = ReturnType<ApplicationService['bankView']>;
export type BankRow = ReturnType<ApplicationService['bankList']>[number];
export type ApplicationSummary = ReturnType<ApplicationService['list']>[number];
export type CompanyView = Company & { syntheticLabel: string | null };
export type ManualCompany = Pick<Company, 'inn' | 'name' | 'legalForm' | 'registrationDate' | 'okved' | 'region'> & { employees?: number | null };
export type MatchesView = { keyRate: number; facts: MatchingFacts; matches: ProductMatch[] };

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal, idempotencyKey?: string): Promise<T> {
  let response: Response;
  try {
    const headers: Record<string, string> = { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) };
    response = await fetch(`/api${path}`, { method, signal, cache: 'no-store', headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK', 'Нет связи с сервером. Проверьте подключение и повторите.');
  }
  const data = await response.json().catch(() => null) as { error?: string; code?: string; details?: unknown } | null;
  if (!response.ok) throw new ApiError(response.status, data?.code ?? 'HTTP_ERROR',
    data?.error ?? (response.status === 429 ? 'Слишком много запросов. Повторите через минуту.' : 'Сервис временно недоступен.'), data?.details);
  return data as T;
}

export const creditApi = {
  demoCompanies: (signal?: AbortSignal) => request<{ companies: CompanyView[]; syntheticLabel: string }>('GET', '/demo/companies', undefined, signal),
  company: (inn: string, signal?: AbortSignal) => request<{ company: CompanyView }>('GET', `/companies/${encodeURIComponent(inn)}`, undefined, signal),
  products: (query: { inn?: string; registrationDate?: string | null; purpose: CreditPurpose; amount: number; term: number }, signal?: AbortSignal) => {
    const params = new URLSearchParams({ purpose: query.purpose, amount: String(query.amount), term: String(query.term) });
    if (query.inn) params.set('inn', query.inn);
    if (query.registrationDate) params.set('registrationDate', query.registrationDate);
    return request<{ products: CreditProduct[]; matches: ProductMatch[]; syntheticLabel: string }>('GET', `/credit/products?${params}`, undefined, signal);
  },
  applications: (signal?: AbortSignal, inn?: string) => request<{ applications: ApplicationSummary[] }>('GET', `/applications${inn ? `?inn=${inn}` : ''}`, undefined, signal),
  application: (id: string, signal?: AbortSignal) => request<ApplicationView>('GET', `/applications/${id}`, undefined, signal),
  create: (body: { companyInn: string; company?: ManualCompany } & ApplicationPatch) => request<ApplicationView>('POST', '/applications', body),
  update: (id: string, patch: ApplicationPatch & { version?: number }) => request<ApplicationView>('PATCH', `/applications/${id}`, patch),
  addDocument: (id: string, document: { type: DocumentType; fileName: string; mimeType: string; sizeBytes: number; textCharacters: number | null }) =>
    request<ApplicationView>('POST', `/applications/${id}/documents`, document),
  submit: (id: string) => request<ProcessedView>('POST', `/applications/${id}/submit`),
  process: (id: string) => request<ProcessedView>('POST', `/applications/${id}/process`),
  accept: (id: string) => request<ApplicationView>('POST', `/applications/${id}/accept`),
  sign: (id: string) => request<ApplicationView>('POST', `/applications/${id}/sign`),
  issue: (id: string) => request<ApplicationView>('POST', `/applications/${id}/issue`),
  /** The key names the installment, so a repeated request for the same payment is replayed, not counted twice. */
  pay: (id: string, installment: number) => request<ApplicationView>('POST', `/applications/${id}/payments`, undefined, undefined, `payment-${id}-${installment}`),
  matches: (id: string, signal?: AbortSignal) => request<MatchesView>('GET', `/applications/${id}/matches`, undefined, signal),
  parseNeed: (text: string) => request<ParsedNeed>('POST', '/assistant/parse-need', { text }),
  improvements: (id: string, signal?: AbortSignal) => request<Improvements>('GET', `/applications/${id}/improvements`, undefined, signal),
  explanation: (id: string, kind: 'decision' | 'improvements', signal?: AbortSignal) =>
    request<ExplanationView>('GET', `/applications/${id}/explanation?kind=${kind}`, undefined, signal),
  bankApplications: (signal?: AbortSignal) => request<{ applications: BankRow[] }>('GET', '/bank/applications', undefined, signal),
  bankApplication: (id: string, signal?: AbortSignal) => request<BankView>('GET', `/bank/applications/${id}`, undefined, signal),
};
