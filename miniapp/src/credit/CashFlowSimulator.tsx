// Interactive Cash Flow & Stress-Testing Visual Component
import { useState, useId } from 'react';
import { calculateCashFlowProjection, type StressTestScenario } from './cashflow';
import { formatRub } from './format';

interface CashFlowSimulatorProps {
  annualRevenue: number;
  annualExpenses: number;
  loanAmount: number;
  loanRate: number;
  loanTermMonths: number;
  existingDebt?: number;
  compact?: boolean;
}

export function CashFlowSimulator({
  annualRevenue,
  annualExpenses,
  loanAmount,
  loanRate,
  loanTermMonths,
  existingDebt = 0,
  compact = false,
}: CashFlowSimulatorProps) {
  const [stress, setStress] = useState<number>(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const chartId = useId();

  const scenario: StressTestScenario = calculateCashFlowProjection({
    annualRevenue,
    annualExpenses,
    newLoanAmount: loanAmount,
    newLoanRate: loanRate,
    newLoanTermMonths: loanTermMonths,
    existingAnnualDebt: existingDebt,
    revenueStressPercent: stress,
  });

  const maxVal = Math.max(...scenario.months.map((m) => Math.max(m.revenue, m.expenses + m.debtService)));
  const chartHeight = compact ? 160 : 220;
  const chartWidth = 600;
  const barWidth = 24;
  const stepX = chartWidth / 12;

  return (
    <div className={`op-cashflow-card ${compact ? 'op-compact' : ''}`}>
      <div className="op-cashflow-head">
        <div>
          <div className="op-cashflow-badge">Финансовое моделирование & Стресс-тест</div>
          <h4 className="op-cashflow-title">Прогноз денежного потока и нагрузка на бизнес</h4>
        </div>
        <div className="op-cashflow-stress-picker" role="group" aria-label="Стресс-сценарий выручки">
          <span className="op-cashflow-label">Стресс-тест выручки:</span>
          {[0, 10, 20, 30].map((s) => (
            <button
              key={s}
              type="button"
              className={`op-stress-pill ${stress === s ? 'active' : ''}`}
              style={{ minHeight: 40 }}
              onClick={() => setStress(s)}
            >
              {s === 0 ? 'Базовый (0%)' : `-${s}%`}
            </button>
          ))}
        </div>
      </div>

      <div className="op-cashflow-metrics">
        <div className="op-metric-box">
          <span className="op-metric-lbl">Запас прочности (DSCR)</span>
          <div className="op-metric-val">
            <span className={`op-dscr-chip op-zone-${scenario.safetyZone.toLowerCase()}`}>
              {scenario.averageDscr.toFixed(2)}x
            </span>
            <small className="op-metric-hint">Мин: {scenario.minDscr.toFixed(2)}x</small>
          </div>
        </div>

        <div className="op-metric-box">
          <span className="op-metric-lbl">Точка безубыточности</span>
          <div className="op-metric-val">
            <strong>{formatRub(scenario.breakEvenMonthlyRevenue)}</strong>
            <small className="op-metric-hint">в месяц</small>
          </div>
        </div>

        <div className="op-metric-box">
          <span className="op-metric-lbl">Мин. остаток в кассе</span>
          <div className="op-metric-val">
            <strong className={scenario.minCumulativeCash < 0 ? 'op-text-danger' : ''}>
              {formatRub(scenario.minCumulativeCash)}
            </strong>
            <small className="op-metric-hint">за 12 месяцев</small>
          </div>
        </div>
      </div>

      <div className="op-chart-wrapper">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="op-cashflow-svg"
          preserveAspectRatio="none"
          aria-label="График денежного потока на 12 месяцев"
        >
          <defs>
            <linearGradient id={`${chartId}-bar-rev`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#43A047" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#2E7D32" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id={`${chartId}-bar-exp`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF5350" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#C62828" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id={`${chartId}-bar-debt`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF3124" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#990000" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              y1={chartHeight * (1 - ratio) - 20}
              x2={chartWidth}
              y2={chartHeight * (1 - ratio) - 20}
              stroke="#E0E0E0"
              strokeDasharray="4 4"
            />
          ))}

          {/* Bars per month */}
          {scenario.months.map((m, idx) => {
            const x = idx * stepX + 10;
            const revH = maxVal > 0 ? (m.revenue / maxVal) * (chartHeight - 45) : 0;
            const expH = maxVal > 0 ? (m.expenses / maxVal) * (chartHeight - 45) : 0;
            const debtH = maxVal > 0 ? (m.debtService / maxVal) * (chartHeight - 45) : 0;

            const isHov = hoveredIndex === idx;

            return (
              <g
                key={m.month}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Revenue column */}
                <rect
                  x={x}
                  y={chartHeight - 25 - revH}
                  width={barWidth / 2}
                  height={revH}
                  fill={`url(#${chartId}-bar-rev)`}
                  rx="3"
                  opacity={isHov ? 1 : 0.85}
                />
                {/* Expenses + Debt stacked column */}
                <rect
                  x={x + barWidth / 2 + 2}
                  y={chartHeight - 25 - expH - debtH}
                  width={barWidth / 2}
                  height={debtH}
                  fill={`url(#${chartId}-bar-debt)`}
                  rx="2"
                  opacity={isHov ? 1 : 0.9}
                />
                <rect
                  x={x + barWidth / 2 + 2}
                  y={chartHeight - 25 - expH}
                  width={barWidth / 2}
                  height={expH}
                  fill={`url(#${chartId}-bar-exp)`}
                  rx="2"
                  opacity={isHov ? 1 : 0.75}
                />

                {/* Month label */}
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#757575"
                  fontWeight={isHov ? 'bold' : 'normal'}
                >
                  {m.monthName}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredIndex !== null && (
          <div className="op-chart-popover">
            <strong>Месяц {scenario.months[hoveredIndex].month} ({scenario.months[hoveredIndex].monthName}):</strong>
            <div>Выручка: {formatRub(scenario.months[hoveredIndex].revenue)}</div>
            <div>Расходы: {formatRub(scenario.months[hoveredIndex].expenses)}</div>
            <div className="op-text-debt">Платёж по кредиту: {formatRub(scenario.months[hoveredIndex].debtService)}</div>
            <div>Чистый поток: {formatRub(scenario.months[hoveredIndex].netCashFlow)}</div>
            <div>DSCR: {scenario.months[hoveredIndex].dscr.toFixed(2)}x</div>
          </div>
        )}
      </div>

      <div className="op-chart-legend">
        <span className="op-legend-item">
          <span className="op-legend-color op-bg-rev" /> Выручка
        </span>
        <span className="op-legend-item">
          <span className="op-legend-color op-bg-exp" /> Операционные расходы
        </span>
        <span className="op-legend-item">
          <span className="op-legend-color op-bg-debt" /> Платёж по кредиту
        </span>
      </div>

      <div className={`op-cashflow-status op-status-${scenario.safetyZone.toLowerCase()}`}>
        <strong>{scenario.safetyZoneLabel}. </strong>
        {scenario.recommendation}
      </div>
    </div>
  );
}
