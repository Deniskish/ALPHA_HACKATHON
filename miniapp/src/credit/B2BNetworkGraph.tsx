// Interactive B2B Supply Chain & Alfa Ecosystem Trust Graph
import { useState } from 'react';
import { analyzeCounterpartyEcosystem, type CounterpartyNode } from './ecosystem';
import { formatRub } from './format';

interface B2BNetworkGraphProps {
  companyInn: string;
  companyName: string;
  annualRevenue: number;
}

export function B2BNetworkGraph({ companyInn, companyName, annualRevenue }: B2BNetworkGraphProps) {
  const analysis = analyzeCounterpartyEcosystem(companyInn, annualRevenue);
  const [selectedNode, setSelectedNode] = useState<CounterpartyNode | null>(null);

  const cx = 250;
  const cy = 160;
  const radius = 105;

  return (
    <div className="op-network-card">
      <div className="op-network-head">
        <div>
          <span className="op-network-badge">Supply Chain Finance & Trust Graph</span>
          <h4 className="op-network-title">Экосистемный граф B2B-контрагентов</h4>
          <span className="op-muted op-small">
            Анализ связей с клиентами экосистемы Альфа-Банка для снижения кредитного риска
          </span>
        </div>
        <div className="op-boost-pill">
          <span className="op-boost-plus">+{analysis.ecosystemBoostPoints} баллов</span>
          <span className="op-boost-sub">скидка -{analysis.rateDiscountPercent}% к ставке</span>
        </div>
      </div>

      <div className="op-network-canvas-wrap">
        <svg viewBox="0 0 500 320" className="op-network-svg" aria-label="B2B Граф контрагентов">
          <defs>
            <radialGradient id="hub-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#EF3124" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#EF3124" stopOpacity="0.0" />
            </radialGradient>
            <linearGradient id="edge-alfa" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#EF3124" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#0d9336" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* Central Glow Circle */}
          <circle cx={cx} cy={cy} r={65} fill="url(#hub-glow)" />

          {/* Edges from Hub to Nodes */}
          {analysis.nodes.map((node, i) => {
            const angle = (i / analysis.nodes.length) * 2 * Math.PI - Math.PI / 2;
            const nx = cx + radius * Math.cos(angle);
            const ny = cy + radius * Math.sin(angle);
            const isSelected = selectedNode?.id === node.id;

            return (
              <g key={`edge-${node.id}`}>
                <line
                  x1={cx}
                  y1={cy}
                  x2={nx}
                  y2={ny}
                  stroke={node.isAlfaClient ? 'url(#edge-alfa)' : '#B0BEC5'}
                  strokeWidth={isSelected ? 3 : node.isAlfaClient ? 2 : 1.2}
                  strokeDasharray={node.isAlfaClient ? '4 2' : 'none'}
                />
                {/* Midpoint flow badge */}
                <circle
                  cx={(cx + nx) / 2}
                  cy={(cy + ny) / 2}
                  r="7"
                  fill={node.isAlfaClient ? '#EF3124' : '#78909C'}
                />
                <text
                  x={(cx + nx) / 2}
                  y={(cy + ny) / 2 + 3}
                  textAnchor="middle"
                  fontSize="7"
                  fill="#ffffff"
                  fontWeight="bold"
                >
                  {node.role === 'BUYER' ? '←' : '→'}
                </text>
              </g>
            );
          })}

          {/* Central Hub Node (Applicant) */}
          <g>
            <circle cx={cx} cy={cy} r="32" fill="#030306" stroke="#EF3124" strokeWidth="2.5" />
            <text x={cx} y={cy - 5} textAnchor="middle" fontSize="10" fill="#ffffff" fontWeight="bold">
              Заявитель
            </text>
            <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fill="#B0BEC5">
              {companyName.length > 14 ? `${companyName.slice(0, 12)}…` : companyName}
            </text>
          </g>

          {/* Counterparty Nodes */}
          {analysis.nodes.map((node, i) => {
            const angle = (i / analysis.nodes.length) * 2 * Math.PI - Math.PI / 2;
            const nx = cx + radius * Math.cos(angle);
            const ny = cy + radius * Math.sin(angle);
            const isSelected = selectedNode?.id === node.id;

            return (
              <g
                key={node.id}
                onClick={() => setSelectedNode(node)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={nx}
                  cy={ny}
                  r={isSelected ? 26 : 22}
                  fill={node.isAlfaClient ? '#f0fdf4' : '#f8f9fa'}
                  stroke={node.isAlfaClient ? '#0d9336' : '#90A4AE'}
                  strokeWidth={isSelected ? 3 : 2}
                />
                {node.isAlfaClient && (
                  <circle cx={nx + 15} cy={ny - 15} r="5" fill="#EF3124" stroke="#fff" strokeWidth="1" />
                )}
                <text x={nx} y={ny - 3} textAnchor="middle" fontSize="8" fill="#030306" fontWeight="bold">
                  {node.role === 'BUYER' ? 'Покупатель' : 'Поставщик'}
                </text>
                <text x={nx} y={ny + 8} textAnchor="middle" fontSize="7" fill="#546E7A">
                  {node.sharePercent}% оборота
                </text>
              </g>
            );
          })}
        </svg>

        {/* Selected Node Details or Callout */}
        <div className="op-network-sidebar">
          {selectedNode ? (
            <div className="op-cp-details">
              <span className="op-node-tag" data-alfa={selectedNode.isAlfaClient}>
                {selectedNode.isAlfaClient ? '● Клиент Альфа-Банка' : 'Внешний контрагент'}
              </span>
              <strong>{selectedNode.name}</strong>
              <div className="op-cp-meta">
                <span>ИНН: <code>{selectedNode.inn}</code></span>
                <span>Объём расчётов: <strong>{formatRub(selectedNode.volumeRub)}</strong> ({selectedNode.sharePercent}%)</span>
                <span>Роль в цепочке: <strong>{selectedNode.role === 'BUYER' ? 'Покупатель (Дебитор)' : 'Поставщик'}</strong></span>
                {selectedNode.isAlfaClient && (
                  <span className="op-text-positive">Обслуживается в Альфе: {selectedNode.alfaClientYears} лет</span>
                )}
              </div>
            </div>
          ) : (
            <div className="op-cp-empty">
              <span>Нажмите на любой узел графа для инспекции хозяйственных связей и подтверждения платежей.</span>
            </div>
          )}
        </div>
      </div>

      <div className="op-network-footer">
        <div className="op-network-stat">
          <span className="op-muted op-small">Замкнутость на Альфа-Банк:</span>
          <strong>{Math.round(analysis.alfaVolumeShare * 100)}% оборота</strong>
        </div>
        <div className="op-network-rationale">
          {analysis.rationale}
        </div>
      </div>
    </div>
  );
}
