// The credit evaluation pipeline as a pure function: readiness → ML risk → scoring → decision.
// ApplicationService records each stage for a submission; "Как улучшить заявку" reuses it for what-if scenarios
// without storing anything. Order of responsibility: ML estimates risk, scoring explains the profile,
// the decision engine applies hard rules, product rules and affordability. None of them calls an LLM.
import { applicationReadiness, type Readiness } from './readiness';
import { ScoringEngine, type Score } from './scoring';
import { CreditDecisionEngine, type Decision } from './decision';
import { buildRiskFeatures } from './features';
import { priceProduct } from './pricing';
import type { RiskModel, RiskModelOutput } from './risk-model';
import type { ApplicationDocument, Company, CreditApplication, CreditProduct, ExternalCheck } from './types';

export type EvaluationInput = {
  application: CreditApplication; company: Company; product: CreditProduct; products: CreditProduct[];
  documents: ApplicationDocument[]; checks: Pick<ExternalCheck, 'provider' | 'status' | 'payload'>[];
  riskModel: RiskModel | null; now: Date;
};
export type Evaluation = { readiness: Readiness; risk: RiskModelOutput | null; score: Score; decision: Decision };

const scoring = new ScoringEngine(), decisions = new CreditDecisionEngine();

export function assessRisk(input: Omit<EvaluationInput, 'products' | 'documents'>): RiskModelOutput | null {
  if (!input.riskModel) return null;
  const features = buildRiskFeatures({ ...input, keyRate: priceProduct(input.product).keyRate });
  return features ? input.riskModel.assess(features) : null;
}

export function evaluate(input: EvaluationInput): Evaluation {
  const { application: app, company, product, documents, checks, now } = input;
  const readiness = applicationReadiness(app, product, company, documents, now);
  const risk = assessRisk(input);
  const score = scoring.score({ requestedAmount: app.requestedAmount!, registrationDate: company.registrationDate, checks, completeness: readiness.completeness, now });
  const decision = decisions.decide({ application: app, product, products: input.products, registrationDate: company.registrationDate,
    externalChecks: checks, scoringResult: score, readiness, documents, now, riskAssessment: risk });
  return { readiness, risk, score, decision };
}
