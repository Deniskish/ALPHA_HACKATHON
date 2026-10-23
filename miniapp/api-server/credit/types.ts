// Domain model of the demo credit conveyor. All products, scores and decisions are synthetic.

export const applicationStates = [
  'DRAFT', 'DATA_COLLECTION', 'READY_TO_SUBMIT', 'SUBMITTED', 'VALIDATING', 'NEEDS_INFO', 'ENRICHING',
  'RISK_ASSESSMENT', 'SCORING', 'DECISION', 'APPROVED', 'COUNTER_OFFER', 'REJECTED', 'OFFER_ACCEPTED', 'COMPLETED',
  'ACTIVE_FINANCING',
] as const;
export type ApplicationState = typeof applicationStates[number];

export const creditPurposes = ['WORKING_CAPITAL', 'EQUIPMENT', 'NEW_LOCATION', 'EXPANSION', 'INVESTMENT_PROJECT', 'REFINANCING',
  'YOUNG_BUSINESS', 'OTHER'] as const;
export type CreditPurpose = typeof creditPurposes[number];

export const documentTypes = ['BANK_STATEMENT', 'FINANCIAL_STATEMENT', 'REGISTRY_EXTRACT', 'INVESTMENT_PLAN', 'LOAN_AGREEMENT', 'OTHER'] as const;
export type DocumentType = typeof documentTypes[number];

export type Financials = {
  /** Annual revenue, ₽. */
  revenue: number;
  /** Annual expenses, ₽. */
  expenses: number;
  /** Annual profit, ₽ (revenue − expenses). */
  profit: number;
  /** Outstanding loans and borrowings, ₽. */
  currentDebt: number;
  /** Reporting year the numbers belong to. */
  period: number;
};

export type DemoScenario = 'APPROVED' | 'COUNTER_OFFER' | 'NEEDS_INFO' | 'REJECTED';

/** Synthetic data a bank already has about its own client. */
export type BankProfile = {
  clientSince: string;
  /** Average monthly incoming turnover on the settlement account, ₽. */
  monthlyTurnover: number;
  /** Bank products the client already uses (labels only). */
  products: string[];
  /** Account requisites known to the bank (masked). */
  accountMasked: string;
};

export type Company = {
  inn: string;
  name: string;
  legalForm: 'ООО' | 'АО' | 'ИП' | 'другое';
  registrationDate: string | null;
  okved: string;
  okvedTitle: string | null;
  region: string;
  employees: number | null;
  /** Latest known financial indicators; null when no source has them. */
  financials: Financials | null;
  source: 'synthetic' | 'manual' | 'registry';
  /** Demo relationship with the bank: clients get prefilled data, non-clients go through INN lookup. */
  relationship: 'client' | 'non_client';
  bankProfile: BankProfile | null;
  isSynthetic: boolean;
  /** Only for synthetic demo companies. */
  demo: { scenario: DemoScenario; title: string; description: string; need: FinancingNeed } | null;
  updatedAt: string;
};

export type FinancingNeed = {
  purpose: CreditPurpose;
  requestedAmount: number;
  requestedTermMonths: number;
};

export type CreditProduct = {
  id: string;
  name: string;
  description: string;
  minAmount: number;
  maxAmount: number;
  minTermMonths: number;
  maxTermMonths: number;
  /** Synthetic annual base rate for low risk = keyRate + productMargin, %. */
  baseRate: number;
  /** Synthetic margin over the key rate, percentage points. */
  productMargin: number;
  minBusinessAgeMonths: number;
  /** Upper bound of business age (products for young businesses), months. */
  maxBusinessAgeMonths: number | null;
  /** Product requires existing loans to refinance. */
  requiresExistingDebt: boolean;
  purposes: CreditPurpose[];
  requiredDocuments: DocumentType[];
  isSynthetic: true;
};

export type DeclaredFinancials = Pick<Financials, 'revenue' | 'expenses' | 'currentDebt'> & {
  /** Number of active loans and leases (obligations group of the questionnaire). */
  activeLoans?: number;
};
/** Self-reported credit history, compared with the bureau during validation. */
export type DeclaredCreditHistory = { hadOverdue12m: boolean; maxOverdueDays: number };

export type CreditApplication = {
  id: string;
  number: string;
  companyInn: string;
  productId: string | null;
  state: ApplicationState;
  purpose: CreditPurpose | null;
  purposeDescription: string;
  requestedAmount: number | null;
  requestedTermMonths: number | null;
  declaredFinancials: DeclaredFinancials | null;
  declaredCreditHistory: DeclaredCreditHistory | null;
  /** Incremented on every submission; checks, scores and decisions belong to an attempt. */
  attempt: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  acceptedOffer: OfferTerms | null;
  /** Simulated financing after signing; no real payments or postings. */
  financing: FinancingAccount | null;
};

/** Simulated loan account after issue. */
export type FinancingAccount = {
  issuedAt: string;
  productId: string;
  amount: number;
  termMonths: number;
  rate: number;
  monthlyPayment: number;
  /** Simulated installments paid so far. */
  paidInstallments: number;
  status: 'ACTIVE' | 'REPAID';
};

export type ApplicationDocument = {
  id: string;
  applicationId: string;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Characters of text extracted in the browser; the file itself is not stored. */
  textCharacters: number | null;
  uploadedAt: string;
};

export type CheckProvider = 'FNS' | 'BKI' | 'FINANCE';
export type CheckStatus = 'OK' | 'NO_HISTORY' | 'NOT_FOUND' | 'DOCUMENT_BASED';
export type ExternalCheck = {
  id: string;
  applicationId: string;
  attempt: number;
  provider: CheckProvider;
  status: CheckStatus;
  payload: Record<string, unknown> | null;
  checkedAt: string;
};

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ScoringFactor = {
  code: 'businessAge' | 'paymentDiscipline' | 'debtLoad' | 'requestedAmountToRevenue' | 'profitability' | 'applicationCompleteness';
  title: string;
  /** Points earned by this factor. */
  impact: number;
  maxImpact: number;
  effect: 'positive' | 'neutral' | 'negative';
  explanation: string;
};
export type ScoringResult = {
  id: string;
  applicationId: string;
  attempt: number;
  score: number;
  riskLevel: RiskLevel;
  /** False when at least one factor had no data and therefore earned zero. */
  dataComplete: boolean;
  factors: ScoringFactor[];
  createdAt: string;
};

/** Output of the separate ML risk model (demo, synthetic training data). */
export type RiskFactor = { feature: string; label: string; impact: 'positive' | 'negative'; text: string };
export type RiskAssessment = {
  id: string;
  applicationId: string;
  attempt: number;
  modelVersion: string;
  /** Estimated probability of a default event within 12 months. */
  probability: number;
  riskLevel: RiskLevel;
  topFactors: RiskFactor[];
  createdAt: string;
};

export type DecisionOutcome = 'APPROVED' | 'COUNTER_OFFER' | 'NEEDS_INFO' | 'REJECTED';
export type OfferTerms = { productId: string; amount: number; termMonths: number; rate: number; monthlyPayment: number;
  /** Demo rate breakdown: rate = keyRate + productMargin + riskPremium. */
  pricing?: { keyRate: number; productMargin: number; riskPremium: number } };
export type DecisionReason = { code: string; kind: 'positive' | 'warning' | 'negative' | 'info'; text: string };
export type RequiredInfo = { code: string; text: string; field?: 'declaredFinancials'; documentType?: DocumentType };
export type CreditDecision = {
  id: string;
  applicationId: string;
  attempt: number;
  outcome: DecisionOutcome;
  offer: OfferTerms | null;
  reasons: DecisionReason[];
  requiredInfo: RequiredInfo[];
  summary: string;
  nextAction: string;
  createdAt: string;
};

export type ApplicationEventType = 'CREATED' | 'UPDATED' | 'STATE_CHANGED' | 'DOCUMENT_ADDED' | 'CHECK_COMPLETED' | 'RISK_ASSESSED'
  | 'SCORED' | 'DECIDED' | 'PAYMENT_SIMULATED';
export type ApplicationEvent = {
  id: string;
  applicationId: string;
  sequence: number;
  type: ApplicationEventType;
  fromState: ApplicationState | null;
  toState: ApplicationState | null;
  message: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export class CreditError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) { super(message); }
}
