// Local stand-ins for external data sources. They never call the network and answer only from
// the synthetic dataset, a configured registry lookup or documents the applicant attached.
import { resolveDate, syntheticSources } from './synthetic-data';
import type { ApplicationDocument, CheckProvider, CheckStatus, Company, CreditApplication } from './types';

export type CheckInput = { company: Company; application: CreditApplication; documents: ApplicationDocument[]; now: Date };
export type CheckOutcome = { status: CheckStatus; payload: Record<string, unknown> | null };
export interface ExternalDataProvider {
  readonly provider: CheckProvider;
  check(input: CheckInput): CheckOutcome;
}

const hasDocument = (documents: ApplicationDocument[], type: ApplicationDocument['type']) => documents.some((d) => d.type === type);

/** Registry facts: company status, registration date, main OKVED. */
export class FNSMockProvider implements ExternalDataProvider {
  readonly provider = 'FNS' as const;
  constructor(private readonly sources = syntheticSources) {}
  check({ company, documents, now }: CheckInput): CheckOutcome {
    const synthetic = this.sources.get(company.inn);
    if (synthetic) return { status: 'OK', payload: { ...synthetic.fns, registrationDate: resolveDate(synthetic.fns.registrationDate, now), source: 'synthetic-registry' } };
    if (company.source === 'registry')
      return { status: 'OK', payload: { active: true, registrationDate: company.registrationDate, okved: company.okved, source: 'registry-lookup' } };
    if (hasDocument(documents, 'REGISTRY_EXTRACT'))
      return { status: 'DOCUMENT_BASED', payload: { active: true, registrationDate: company.registrationDate, okved: company.okved, source: 'applicant-document' } };
    return { status: 'NOT_FOUND', payload: null };
  }
}

/** Credit history: active debt, overdue amount and the longest delay. */
export class BKIMockProvider implements ExternalDataProvider {
  readonly provider = 'BKI' as const;
  constructor(private readonly sources = syntheticSources) {}
  check({ company }: CheckInput): CheckOutcome {
    const synthetic = this.sources.get(company.inn);
    if (synthetic) return { status: synthetic.bki.hasHistory ? 'OK' : 'NO_HISTORY', payload: { ...synthetic.bki, source: 'synthetic-bureau' } };
    return { status: 'NO_HISTORY', payload: { activeDebt: 0, overdueAmount: 0, maxDaysOverdue: 0, hasHistory: false, activeLoans: 0, latePayments12m: 0, source: 'synthetic-bureau' } };
  }
}

/** Annual financial indicators. Declared numbers count only together with an attached financial statement. */
export class FinancialDataMockProvider implements ExternalDataProvider {
  readonly provider = 'FINANCE' as const;
  constructor(private readonly sources = syntheticSources) {}
  check({ company, application, documents, now }: CheckInput): CheckOutcome {
    const finance = this.sources.get(company.inn)?.finance;
    if (finance) return { status: 'OK', payload: { ...finance, source: 'synthetic-accounting' } };
    const declared = application.declaredFinancials;
    if (declared && hasDocument(documents, 'FINANCIAL_STATEMENT'))
      return { status: 'DOCUMENT_BASED', payload: { ...declared, profit: declared.revenue - declared.expenses,
        period: now.getUTCFullYear() - 1, source: 'applicant-document' } };
    return { status: 'NOT_FOUND', payload: null };
  }
}

export const defaultProviders = (): ExternalDataProvider[] => [new FNSMockProvider(), new BKIMockProvider(), new FinancialDataMockProvider()];
