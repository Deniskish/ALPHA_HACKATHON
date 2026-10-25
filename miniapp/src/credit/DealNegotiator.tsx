// Interactive Pareto Deal Negotiator for Counter-Offers & Terms Tuning
import { useState } from 'react';
import { monthlyPayment } from '../../api-server/credit/finance';
import { formatRub, months } from './format';
import { Button } from '@alfalab/core-components-button';
import { CheckmarkMIcon } from '@alfalab/icons-glyph/CheckmarkMIcon';

export interface DealLever {
  id: string;
  label: string;
  amountBoostRub: number;
  rateDiscountPercent: number;
  riskReductionShare: number;
}

export const PARETO_LEVERS: DealLever[] = [
  { id: 'director_guarantee', label: 'Личное поручительство собственника/гендиректора', amountBoostRub: 1_800_000, rateDiscountPercent: 0, riskReductionShare: 0.15 },
  { id: 'equipment_pledge', label: 'Залог приобретаемого оборудования / техники', amountBoostRub: 2_600_000, rateDiscountPercent: 0.5, riskReductionShare: 0.25 },
  { id: 'alfa_acquiring', label: 'Перевод от 70% торгового эквайринга в Альфа-Банк', amountBoostRub: 800_000, rateDiscountPercent: 1.0, riskReductionShare: 0.10 },
];

export interface NegotiatedTerms {
  amount: number;
  termMonths: number;
  rate: number;
  payment: number;
  profitBurdenShare: number;
  approvalProbability: number;
  activeLevers: string[];
}

export function calculateParetoDeal(params: {
  baseAmount: number;
  requestedAmount: number;
  baseTermMonths: number;
  baseRate: number;
  monthlyProfit: number;
  selectedAmount: number;
  selectedTermMonths: number;
  activeLevers: string[];
}): NegotiatedTerms {
  const {
    baseAmount,
    baseRate,
    monthlyProfit,
    selectedAmount,
    selectedTermMonths,
    activeLevers,
  } = params;

  let totalBoost = 0;
  let totalRateDiscount = 0;
  let totalRiskReduction = 0;

  for (const leverId of activeLevers) {
    const lever = PARETO_LEVERS.find((l) => l.id === leverId);
    if (lever) {
      totalBoost += lever.amountBoostRub;
      totalRateDiscount += lever.rateDiscountPercent;
      totalRiskReduction += lever.riskReductionShare;
    }
  }

  const effectiveRate = Math.max(10, baseRate - totalRateDiscount);
  const payment = monthlyPayment(selectedAmount, effectiveRate, selectedTermMonths);
  const profitBurden = monthlyProfit > 0 ? payment / monthlyProfit : 1.0;

  // Baseline approval probability formula based on burden & capacity
  const maxSafeAmount = baseAmount + totalBoost;
  let prob = 0.95;

  if (selectedAmount > maxSafeAmount) {
    const overage = (selectedAmount - maxSafeAmount) / maxSafeAmount;
    prob -= overage * 0.8;
  }
  if (profitBurden > 0.50) {
    prob -= (profitBurden - 0.50) * 1.2;
  }
  prob += totalRiskReduction;
  prob = Math.max(0.15, Math.min(0.99, prob));

  return {
    amount: selectedAmount,
    termMonths: selectedTermMonths,
    rate: effectiveRate,
    payment,
    profitBurdenShare: Math.round(profitBurden * 100) / 100,
    approvalProbability: Math.round(prob * 100),
    activeLevers,
  };
}

interface DealNegotiatorProps {
  offeredAmount: number;
  requestedAmount: number;
  offeredTermMonths: number;
  requestedTermMonths: number;
  baseRate: number;
  monthlyProfit: number;
  onApply?: (terms: NegotiatedTerms) => void;
}

export function DealNegotiator({
  offeredAmount,
  requestedAmount,
  offeredTermMonths,
  requestedTermMonths,
  baseRate,
  monthlyProfit,
  onApply,
}: DealNegotiatorProps) {
  const minAmount = offeredAmount;
  const maxAmount = Math.max(requestedAmount, offeredAmount * 1.5);

  const [amount, setAmount] = useState<number>(offeredAmount);
  const [term, setTerm] = useState<number>(offeredTermMonths);
  const [levers, setLevers] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);

  const toggleLever = (id: string) => {
    setLevers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const deal = calculateParetoDeal({
    baseAmount: offeredAmount,
    requestedAmount,
    baseTermMonths: offeredTermMonths,
    baseRate,
    monthlyProfit,
    selectedAmount: amount,
    selectedTermMonths: term,
    activeLevers: levers,
  });

  return (
    <div className="op-negotiator-card" aria-label="Интерактивный конструктор сделки">
      <div className="op-negotiator-head">
        <div>
          <span className="op-negotiator-badge">Pareto Frontier Optimizer</span>
          <h4 className="op-negotiator-title">Конструктор сделки: Настройка параметров встречного предложения</h4>
          <span className="op-muted op-small">
            Настройте сумму и срок, используя рычаги снижения риска для достижения оптимальных условий
          </span>
        </div>
        <div className="op-prob-pill" data-prob={deal.approvalProbability >= 80 ? 'high' : deal.approvalProbability >= 60 ? 'medium' : 'low'}>
          <span className="op-prob-val">{deal.approvalProbability}%</span>
          <span className="op-prob-lbl">вероятность одобрения</span>
        </div>
      </div>

      <div className="op-negotiator-grid">
        {/* Sliders Column */}
        <div className="op-controls-col">
          <div className="op-slider-row">
            <div className="op-slider-meta">
              <span>Сумма кредита:</span>
              <strong>{formatRub(amount)}</strong>
            </div>
            <input
              type="range"
              min={minAmount}
              max={maxAmount}
              step={100_000}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="op-range-slider"
            />
            <div className="op-slider-bounds">
              <span>Предложено: {formatRub(offeredAmount)}</span>
              <span>Запрошено: {formatRub(requestedAmount)}</span>
            </div>
          </div>

          <div className="op-slider-row">
            <div className="op-slider-meta">
              <span>Срок финансирования:</span>
              <strong>{months(term)}</strong>
            </div>
            <input
              type="range"
              min={Math.min(requestedTermMonths, 12)}
              max={60}
              step={6}
              value={term}
              onChange={(e) => setTerm(Number(e.target.value))}
              className="op-range-slider"
            />
            <div className="op-slider-bounds">
              <span>{Math.min(requestedTermMonths, 12)} мес.</span>
              <span>60 мес.</span>
            </div>
          </div>

          {/* Levers Checklist */}
          <div className="op-levers-section">
            <span className="op-levers-title">Рычаги оптимизации ставки и лимита:</span>
            <div className="op-levers-list">
              {PARETO_LEVERS.map((lever) => {
                const active = levers.includes(lever.id);
                return (
                  <label key={lever.id} className={`op-lever-item ${active ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleLever(lever.id)}
                    />
                    <div className="op-lever-body">
                      <span>{lever.label}</span>
                      <small className="op-muted">
                        +{formatRub(lever.amountBoostRub)} к лимиту
                        {lever.rateDiscountPercent > 0 ? `, -${lever.rateDiscountPercent}% к ставке` : ''}
                      </small>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Pareto Results & 2D Curve */}
        <div className="op-results-col">
          <div className="op-pareto-metrics">
            <div className="op-p-metric">
              <span className="op-muted op-small">Ежемесячный платёж</span>
              <strong>{formatRub(deal.payment)}</strong>
              <small className="op-muted">{Math.round(deal.profitBurdenShare * 100)}% от прибыли</small>
            </div>
            <div className="op-p-metric">
              <span className="op-muted op-small">Эффективная ставка</span>
              <strong>{deal.rate.toFixed(1).replace('.', ',')}%</strong>
              <small className="op-muted">годовых</small>
            </div>
          </div>

          {/* Mini Pareto Curve Visualization */}
          <div className="op-pareto-curve-box">
            <svg viewBox="0 0 240 120" className="op-pareto-svg">
              {/* Axes */}
              <line x1="25" y1="100" x2="225" y2="100" stroke="#CFD8DC" strokeWidth="1" />
              <line x1="25" y1="15" x2="25" y2="100" stroke="#CFD8DC" strokeWidth="1" />

              {/* Pareto Frontier Curve: Payment vs Approval */}
              <path
                d="M 30 25 Q 90 35 150 70 T 220 95"
                fill="none"
                stroke="#0d9336"
                strokeWidth="2.5"
                strokeDasharray="4 2"
              />

              {/* Current Choice Point on Canvas */}
              {(() => {
                const px = 25 + ((amount - minAmount) / Math.max(1, maxAmount - minAmount)) * 180;
                const py = 100 - (deal.approvalProbability / 100) * 80;
                return (
                  <g>
                    <circle cx={px} cy={py} r="8" fill="#EF3124" stroke="#fff" strokeWidth="2" />
                    <text x={px} y={py - 12} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#030306">
                      {deal.approvalProbability}%
                    </text>
                  </g>
                );
              })()}

              <text x="125" y="115" textAnchor="middle" fontSize="8" fill="#78909C">Сумма финансирования →</text>
              <text x="15" y="55" textAnchor="middle" fontSize="7" fill="#78909C" transform="rotate(-90 15 55)">Одобрение ↑</text>
            </svg>
          </div>

          <div className="op-negotiator-actions">
            <Button
              view="accent"
              size={48}
              block
              leftAddons={applied ? <CheckmarkMIcon /> : undefined}
              onClick={() => {
                setApplied(true);
                onApply?.(deal);
                setTimeout(() => setApplied(false), 2500);
              }}
            >
              {applied ? 'Условия зафиксированы' : 'Выбрать эти условия сделки'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
