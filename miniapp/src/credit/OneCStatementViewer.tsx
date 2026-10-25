// Visual viewer for parsed 1C bank statements with cashflow structure
import type { ParsedOneCStatement } from '../shared/one-c-parser';
import { formatRub } from './format';
import { Button } from '@alfalab/core-components-button';
import { CheckmarkMIcon } from '@alfalab/icons-glyph/CheckmarkMIcon';

interface OneCStatementViewerProps {
  statement: ParsedOneCStatement;
  onApply: () => void;
  onClose?: () => void;
}

export function OneCStatementViewer({ statement, onApply, onClose }: OneCStatementViewerProps) {
  const maxMonthly = Math.max(
    ...statement.monthlyBreakdown.map((m) => Math.max(m.inflow, m.outflow))
  );

  return (
    <div className="op-1c-viewer-card">
      <div className="op-1c-header">
        <div>
          <span className="op-1c-badge">1C:Предприятие 8.3 · Проверено на клиенте</span>
          <h4 className="op-1c-title">Анализ банковской выписки (1C_to_kl.txt)</h4>
          <span className="op-muted op-small">
            Счёт {statement.account} · Период: {statement.startDate} — {statement.endDate} ({statement.operationsCount} операций)
          </span>
        </div>
        <div className="op-actions-inline">
          <Button view="accent" size={32} leftAddons={<CheckmarkMIcon />} onClick={onApply}>
            Применить в анкету
          </Button>
          {onClose && (
            <Button view="secondary" size={32} onClick={onClose}>
              Скрыть
            </Button>
          )}
        </div>
      </div>

      <div className="op-1c-kpi-grid">
        <div className="op-1c-kpi-cell">
          <span className="op-muted op-small">Поступления (Выручка)</span>
          <strong className="op-text-positive">{formatRub(statement.totalInflow)}</strong>
        </div>
        <div className="op-1c-kpi-cell">
          <span className="op-muted op-small">Списания (Расходы)</span>
          <strong className="op-text-negative">{formatRub(statement.totalOutflow)}</strong>
        </div>
        <div className="op-1c-kpi-cell">
          <span className="op-muted op-small">Чистый результат</span>
          <strong className={statement.netProfit >= 0 ? 'op-text-positive' : 'op-text-negative'}>
            {formatRub(statement.netProfit)}
          </strong>
        </div>
        <div className="op-1c-kpi-cell">
          <span className="op-muted op-small">Среднемес. оборот</span>
          <strong>{formatRub(Math.round(statement.totalInflow / 12))}</strong>
        </div>
      </div>

      {/* Monthly visual breakdown chart */}
      <div className="op-1c-chart-box">
        <span className="op-1c-chart-title">Помесячная динамика поступлений и списаний</span>
        <div className="op-1c-bars-container">
          {statement.monthlyBreakdown.map((m) => {
            const inH = maxMonthly > 0 ? (m.inflow / maxMonthly) * 80 : 0;
            const outH = maxMonthly > 0 ? (m.outflow / maxMonthly) * 80 : 0;
            return (
              <div key={m.month} className="op-1c-bar-col" title={`${m.month}: Поступило ${formatRub(m.inflow)}, Списано ${formatRub(m.outflow)}`}>
                <div className="op-1c-bar-pair">
                  <div className="op-1c-bar op-bar-in" style={{ height: `${inH}px` }} />
                  <div className="op-1c-bar op-bar-out" style={{ height: `${outH}px` }} />
                </div>
                <span className="op-1c-month-lbl">{m.month}</span>
              </div>
            );
          })}
        </div>
        <div className="op-1c-legend">
          <span className="op-legend-item"><span className="op-legend-color op-bg-rev" /> Поступления</span>
          <span className="op-legend-item"><span className="op-legend-color op-bg-exp" /> Списания</span>
        </div>
      </div>

      {/* Top Counterparties */}
      {statement.topCounterparties.length > 0 && (
        <div className="op-1c-counterparties">
          <span className="op-1c-section-sub">Ключевые контрагенты по обороту:</span>
          <div className="op-1c-tags">
            {statement.topCounterparties.map((cp) => (
              <span key={cp.name} className="op-1c-counterparty-tag">
                <span className={cp.type === 'IN' ? 'op-dot-in' : 'op-dot-out'}>●</span>
                <strong>{cp.name}</strong>
                <span className="op-muted">({formatRub(cp.amount)})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="op-1c-footer-note">
        {statement.summaryNote}
      </div>
    </div>
  );
}
