// Feature Builder for the ML risk model. Feature names and categories match ml/feature_spec.json,
// which the Python dataset generator and trainer use, so training and inference see the same inputs.
import { businessAgeMonths, monthlyPayment } from './finance';
import { industryOf, type Industry } from './industry';
import { financialFacts } from './scoring';
import type { Company, CreditApplication, CreditProduct, CreditPurpose, ExternalCheck } from './types';

export type RegionGroup = 'capital' | 'large' | 'other';
export type LegalFormCode = 'OOO' | 'AO' | 'IP' | 'OTHER';
export type RiskFeatures = {
  businessAgeMonths: number; legalForm: LegalFormCode; industry: Industry; region: RegionGroup; employees: number;
  annualRevenue: number; annualExpenses: number; annualProfit: number; profitMargin: number; monthlyCashflow: number;
  currentDebt: number; debtToRevenue: number;
  activeLoans: number; latePayments12m: number; maxOverdueDays: number; overdueAmount: number; overdueToRevenue: number;
  requestedAmount: number; requestedTermMonths: number; purpose: CreditPurpose; amountToRevenue: number;
  estimatedPayment: number; paymentToProfit: number;
  keyRate: number;
};

const capital = /москва|санкт-петербург|московская|ленинградская/i;
const large = /татарстан|новосибирск|свердловск|краснодар|нижегородск|самарск|ростовск|башкортостан|челябинск|красноярск|пермск|воронежск/i;
export function regionGroup(region: string): RegionGroup {
  return capital.test(region) ? 'capital' : large.test(region) ? 'large' : 'other';
}
const legalForms: Record<Company['legalForm'], LegalFormCode> = { 'ООО': 'OOO', 'АО': 'AO', 'ИП': 'IP', 'другое': 'OTHER' };

/**
 * Builds model features from the same data the scoring uses. Returns null when financial facts are missing:
 * the model is not asked to guess, and the decision engine requests the data instead.
 */
export function buildRiskFeatures(input: { application: CreditApplication; company: Company; product: CreditProduct;
  checks: Pick<ExternalCheck, 'provider' | 'status' | 'payload'>[]; keyRate: number; now: Date }): RiskFeatures | null {
  const { application: app, company } = input;
  const facts = financialFacts(input.checks);
  if (facts.revenue === null || facts.profit === null || !app.requestedAmount || !app.requestedTermMonths || !app.purpose) return null;
  const finance = input.checks.find((c) => c.provider === 'FINANCE' && c.status !== 'NOT_FOUND')?.payload ?? {};
  const bki = facts.bki;
  const revenue = facts.revenue, profit = facts.profit, debt = facts.debt ?? 0;
  const age = businessAgeMonths(facts.fns?.registrationDate ?? company.registrationDate, input.now) ?? 0;
  const payment = monthlyPayment(app.requestedAmount, input.product.baseRate, app.requestedTermMonths);
  return {
    businessAgeMonths: age, legalForm: legalForms[company.legalForm] ?? 'OTHER', industry: industryOf(company.okved),
    region: regionGroup(company.region), employees: company.employees ?? 0,
    annualRevenue: revenue, annualExpenses: Number(finance.expenses ?? revenue - profit), annualProfit: profit,
    profitMargin: profit / revenue, monthlyCashflow: profit / 12, currentDebt: debt, debtToRevenue: debt / revenue,
    activeLoans: bki?.activeLoans ?? app.declaredFinancials?.activeLoans ?? 0,
    latePayments12m: bki?.latePayments12m ?? 0, maxOverdueDays: bki?.maxDaysOverdue ?? 0, overdueAmount: bki?.overdueAmount ?? 0,
    overdueToRevenue: (bki?.overdueAmount ?? 0) / revenue,
    requestedAmount: app.requestedAmount, requestedTermMonths: app.requestedTermMonths, purpose: app.purpose,
    amountToRevenue: app.requestedAmount / revenue, estimatedPayment: payment,
    paymentToProfit: profit > 0 ? payment / (profit / 12) : 10,
    keyRate: input.keyRate,
  };
}
