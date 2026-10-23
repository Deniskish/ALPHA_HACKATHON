// ML risk model contract. The model estimates the probability of a default event within 12 months
// (demo target default12m, trained on synthetic data). It is one input of the decision engine, never the decision.
import type { RiskFeatures } from './features';
import type { RiskFactor, RiskLevel } from './types';

export type RiskModelOutput = { modelVersion: string; probability: number; riskLevel: RiskLevel; topFactors: RiskFactor[] };
export interface RiskModel {
  readonly version: string;
  assess(features: RiskFeatures): RiskModelOutput;
}
