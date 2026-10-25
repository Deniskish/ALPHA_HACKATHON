// Opportunity Cost and Business Growth ROI Calculator
import { useState } from 'react';
import { monthlyPayment } from '../../api-server/credit/finance';
import { formatRub, months } from './format';

export interface OpportunityRoi {
  requestedAmount: number;
  termMonths: number;
  rate: number;
  monthlyPayment: number;
  totalInterest: number;
  projectMonthlyProfit: number;
  monthsToAccumulate: number;
  lostProfitDuringWait: number;
  netEconomicBenefit: number;
  roiPercent: number;
}

export function calculateOpportunityRoi(params: {
  requestedAmount: number;
  termMonths: number;
  rate: number; // e.g. 19.5
  monthlyBusinessSavings: number; // monthly cash available for accumulation
  projectAnnualYieldShare?: number; // expected annual return on invested capital, e.g. 0.40 (40%)
}): OpportunityRoi {
  const {
    requestedAmount,
    termMonths,
    rate,
    monthlyBusinessSavings,
    projectAnnualYieldShare = 0.45, // typical SME project yields 45% return on capital
  } = params;

  const payment = monthlyPayment(requestedAmount, rate, termMonths);
  const totalPaid = payment * termMonths;
  const totalInterest = Math.max(0, totalPaid - requestedAmount);

  // Time required to self-accumulate the capital
  const monthsToAccumulate = monthlyBusinessSavings > 0
    ? Math.min(60, Math.ceil(requestedAmount / monthlyBusinessSavings))
    : 36;

  // Monthly profit generated once invested
  const projectMonthlyProfit = Math.round((requestedAmount * projectAnnualYieldShare) / 12);

  // Lost profit during the months spent accumulating
  const lostProfitDuringWait = projectMonthlyProfit * monthsToAccumulate;

  // Net benefit = Lost profit during wait - Interest paid to bank
  const netEconomicBenefit = lostProfitDuringWait - totalInterest;
  const roiPercent = requestedAmount > 0 ? Math.round((netEconomicBenefit / requestedAmount) * 100) : 0;

  return {
    requestedAmount,
    termMonths,
    rate,
    monthlyPayment: payment,
    totalInterest,
    projectMonthlyProfit,
    monthsToAccumulate,
    lostProfitDuringWait,
    netEconomicBenefit,
    roiPercent,
  };
}

interface GrowthRoiCalculatorProps {
  amount: number;
  termMonths: number;
  rate?: number;
}

export function GrowthRoiCalculator({ amount, termMonths, rate = 19.5 }: GrowthRoiCalculatorProps) {
  const [expectedYield, setExpectedYield] = useState<number>(45); // 45% annual project return

  const roi = calculateOpportunityRoi({
    requestedAmount: amount,
    termMonths,
    rate,
    monthlyBusinessSavings: Math.max(50_000, Math.round(amount / 24)),
    projectAnnualYieldShare: expectedYield / 100,
  });

  return (
    <div className="op-roi-card" aria-label="Калькулятор экономической отдачи и упущенной выгоды">
      <div className="op-roi-head">
        <div>
          <span className="op-roi-badge">ROI & Opportunity Cost Analysis</span>
          <h4 className="op-roi-title">Экономическая выгода старта сейчас vs Накопление</h4>
          <span className="op-muted op-small">
            Почему финансирование сейчас выгоднее многомесячного накопления из операционной кассы
          </span>
        </div>
        <div className="op-roi-gain-pill">
          <span className="op-roi-gain-val">+{formatRub(roi.netEconomicBenefit)}</span>
          <span className="op-roi-gain-lbl">чистая выгода от старта сейчас</span>
        </div>
      </div>

      <div className="op-roi-grid">
        {/* Comparison Columns */}
        <div className="op-roi-compare-box">
          <div className="op-roi-scenario op-sc-now">
            <span className="op-sc-tag">Кредит Альфа-Банка сейчас</span>
            <strong>Запуск за 1 день</strong>
            <div className="op-sc-details">
              <span>Прирост прибыли в месяц: <strong>+{formatRub(roi.projectMonthlyProfit)}</strong></span>
              <span>Переплата по процентам за {months(termMonths)}: <span className="op-text-debt">{formatRub(roi.totalInterest)}</span></span>
              <span>Итоговая отдача на проект: <strong className="op-text-positive">+{roi.roiPercent}% ROI</strong></span>
            </div>
          </div>

          <div className="op-roi-scenario op-sc-wait">
            <span className="op-sc-tag">Копить из выручки</span>
            <strong>Ожидание {roi.monthsToAccumulate} месяцев</strong>
            <div className="op-sc-details">
              <span>Срок простоя бизнеса: <strong>{months(roi.monthsToAccumulate)}</strong></span>
              <span>Упущенная за это время прибыль: <span className="op-text-danger">-{formatRub(roi.lostProfitDuringWait)}</span></span>
              <span>Инфляционное удорожание оборудования / сырья</span>
            </div>
          </div>
        </div>

        {/* Visual Bar Comparison */}
        <div className="op-roi-visual-box">
          <div className="op-roi-slider-row">
            <div className="op-slider-meta">
              <span>Ожидаемая рентабельность проекта:</span>
              <strong>{expectedYield}% годовых</strong>
            </div>
            <input
              type="range"
              min={20}
              max={80}
              step={5}
              value={expectedYield}
              onChange={(e) => setExpectedYield(Number(e.target.value))}
              className="op-range-slider"
            />
          </div>

          <div className="op-roi-conclusion">
            <span className="op-conclusion-bullet">💡</span>
            <p>
              При ожидаемой рентабельности {expectedYield}% годовых проект генерирует{' '}
              <strong>{formatRub(roi.projectMonthlyProfit)}</strong> чистой прибыли каждый месяц. Откладывание старта на{' '}
              {months(roi.monthsToAccumulate)} лишит компанию <strong>{formatRub(roi.lostProfitDuringWait)}</strong> прибыли, что многократно превышает проценты банку (
              {formatRub(roi.totalInterest)}).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
