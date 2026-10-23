// Demo pricing: rate = keyRate + productMargin + riskPremium. All parameters are synthetic and only illustrate
// how a rate can be explained; this is not a pricing formula of any bank.
import type { CreditProduct, RiskLevel } from './types';

export const RISK_PREMIUM: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 2, HIGH: 4 };

export type Pricing = { keyRate: number; productMargin: number; riskPremium: number; rate: number };

export function priceProduct(product: CreditProduct, risk: RiskLevel = 'LOW'): Pricing {
  const keyRate = Math.round((product.baseRate - product.productMargin) * 10) / 10;
  const riskPremium = RISK_PREMIUM[risk];
  return { keyRate, productMargin: product.productMargin, riskPremium, rate: Math.round((product.baseRate + riskPremium) * 10) / 10 };
}
