// Cash Flow and Stress-Testing Engine for SME Credit conveyor
import { monthlyPayment } from '../../api-server/credit/finance';

export interface CashFlowMonth {
  month: number;
  monthName: string;
  revenue: number;
  expenses: number;
  operatingIncome: number;
  debtService: number;
  netCashFlow: number;
  cumulativeCash: number;
  dscr: number;
}

export interface StressTestScenario {
  revenueStressPercent: number; // e.g. 0, 10, 20, 30 (%)
  months: CashFlowMonth[];
  averageDscr: number;
  minDscr: number;
  minCumulativeCash: number;
  breakEvenMonthlyRevenue: number;
  safetyZone: 'GREEN' | 'YELLOW' | 'RED';
  safetyZoneLabel: string;
  recommendation: string;
}

const MONTH_NAMES = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'
];

export function calculateCashFlowProjection(params: {
  annualRevenue: number;
  annualExpenses: number;
  annualProfit?: number;
  initialCashReserve?: number;
  existingAnnualDebt?: number;
  newLoanAmount: number;
  newLoanRate: number; // in percent, e.g. 19.5
  newLoanTermMonths: number;
  revenueStressPercent?: number; // 0, 10, 20, 30
}): StressTestScenario {
  const {
    annualRevenue,
    annualExpenses,
    initialCashReserve = Math.round(annualRevenue * 0.05), // ~5% of annual revenue as starting operating buffer
    existingAnnualDebt = 0,
    newLoanAmount,
    newLoanRate,
    newLoanTermMonths,
    revenueStressPercent = 0,
  } = params;

  const baseMonthlyRevenue = Math.max(0, annualRevenue / 12);
  const baseMonthlyExpenses = Math.max(0, annualExpenses / 12);
  
  // Operating cost structure: 60% variable (contracts with revenue), 40% fixed (rent, base payroll)
  const fixedExpenses = baseMonthlyExpenses * 0.40;
  const variableRatio = baseMonthlyRevenue > 0 ? (baseMonthlyExpenses * 0.60) / baseMonthlyRevenue : 0.60;
  
  const existingMonthlyDebt = existingAnnualDebt > 0 ? existingAnnualDebt / 12 : 0;
  const newMonthlyPayment = newLoanAmount > 0 
    ? monthlyPayment(newLoanAmount, newLoanRate, Math.max(1, newLoanTermMonths))
    : 0;
  const totalMonthlyDebtService = existingMonthlyDebt + newMonthlyPayment;

  const stressFactor = Math.max(0, 1 - (revenueStressPercent / 100));
  
  let cumulative = initialCashReserve;
  const months: CashFlowMonth[] = [];
  let dscrSum = 0;
  let minDscr = Infinity;
  let minCumulative = Infinity;

  for (let i = 0; i < 12; i++) {
    // Subtle realistic seasonality wave (+-4%)
    const seasonalMultiplier = 1 + 0.04 * Math.sin((i / 12) * 2 * Math.PI);
    const stressedRevenue = Math.round(baseMonthlyRevenue * stressFactor * seasonalMultiplier);
    const stressedExpenses = Math.round(fixedExpenses + stressedRevenue * variableRatio);
    const operatingIncome = stressedRevenue - stressedExpenses;
    const netCashFlow = operatingIncome - totalMonthlyDebtService;
    cumulative += netCashFlow;

    if (cumulative < minCumulative) minCumulative = cumulative;

    const dscr = totalMonthlyDebtService > 0 
      ? Math.round((operatingIncome / totalMonthlyDebtService) * 100) / 100
      : 9.99;
    
    if (dscr < minDscr) minDscr = dscr;
    dscrSum += dscr;

    months.push({
      month: i + 1,
      monthName: MONTH_NAMES[i],
      revenue: stressedRevenue,
      expenses: stressedExpenses,
      operatingIncome,
      debtService: Math.round(totalMonthlyDebtService),
      netCashFlow: Math.round(netCashFlow),
      cumulativeCash: Math.round(cumulative),
      dscr: Math.max(0, dscr),
    });
  }

  const averageDscr = Math.round((dscrSum / 12) * 100) / 100;
  
  // Break-even revenue: Operating income >= totalMonthlyDebtService
  // Rev - (fixed + Rev * variableRatio) = totalMonthlyDebtService
  // Rev * (1 - variableRatio) = fixed + totalMonthlyDebtService
  const breakEvenMonthlyRevenue = (1 - variableRatio) > 0.01 
    ? Math.round((fixedExpenses + totalMonthlyDebtService) / (1 - variableRatio))
    : Math.round(baseMonthlyRevenue);

  let safetyZone: 'GREEN' | 'YELLOW' | 'RED';
  let safetyZoneLabel: string;
  let recommendation: string;

  if (minDscr >= 1.30 && minCumulative >= 0) {
    safetyZone = 'GREEN';
    safetyZoneLabel = 'Зона высокой устойчивости (DSCR ≥ 1.30)';
    recommendation = 'Операционный денежный поток с комфортным запасом перекрывает платежи даже при сезонных колебаниях.';
  } else if (minDscr >= 1.00 && minCumulative >= -initialCashReserve * 0.5) {
    safetyZone = 'YELLOW';
    safetyZoneLabel = 'Зона умеренной нагрузки (1.00 ≤ DSCR < 1.30)';
    recommendation = 'Платежи обслуживаются впритирку. Рекомендуется увеличить срок финансирования для снижения аннуитета.';
  } else {
    safetyZone = 'RED';
    safetyZoneLabel = 'Зона кассового риска (DSCR < 1.00 или дефицит кассы)';
    recommendation = 'Риск возникновения кассового разрыва. Требуется снизить сумму кредита или рассмотреть ступенчатый график.';
  }

  return {
    revenueStressPercent,
    months,
    averageDscr,
    minDscr: minDscr === Infinity ? 0 : Math.max(0, minDscr),
    minCumulativeCash: minCumulative,
    breakEvenMonthlyRevenue,
    safetyZone,
    safetyZoneLabel,
    recommendation,
  };
}
