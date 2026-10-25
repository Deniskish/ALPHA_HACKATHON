// Interactive B2B Supply Chain & Alfa Ecosystem Trust Graph
import { useState } from 'react';
import { SegmentedControl, Segment } from '@alfalab/core-components-segmented-control';
import { analyzeCounterpartyEcosystem, type CounterpartyNode } from './ecosystem';
import { formatRub } from './format';

export interface B2BNetworkGraphProps {
  companyInn: string;
  companyName: string;
  annualRevenue: number;
  initialMode?: 'flow' | 'radial';
}

export function B2BNetworkGraph({
  companyInn,
  companyName,
  annualRevenue,
  initialMode = 'flow',
}: B2BNetworkGraphProps) {
  const analysis = analyzeCounterpartyEcosystem(companyInn, annualRevenue);
  const [viewMode, setViewMode] = useState<'flow' | 'radial'>(initialMode);
  const [selectedNode, setSelectedNode] = useState<CounterpartyNode | null>(null);

  const suppliers = analysis.nodes.filter((n) => n.role === 'SUPPLIER');
  const buyers = analysis.nodes.filter((n) => n.role === 'BUYER');

  // Radial canvas dimensions: 720 x 440
  const width = 720;
  const height = 440;
  const cx = 360;
  const cy = 220;

  // Applicant box size
  const appW = 200;
  const appH = 90;

  // Counterparty pill size
  const pillW = 210;
  const pillH = 74;

  // Compute positions for radial nodes nicely spaced around the applicant
  const totalNodes = analysis.nodes.length;
  const radialPositions = analysis.nodes.map((node, i) => {
    // Distribute angles evenly, offsetting from 0 to avoid exact top/bottom overlap
    // Angle starting at -PI/2 (top) + step
    const angle = (i / totalNodes) * 2 * Math.PI - Math.PI / 2;
    // Elliptical distribution matching 720x440 canvas
    const rx = 240;
    const ry = 145;
    const nx = cx + rx * Math.cos(angle);
    const ny = cy + ry * Math.sin(angle);
    return { node, x: nx, y: ny, angle };
  });

  return (
    <div className="op-network-card" data-testid="b2b-network-graph">
      {/* 1. Header with Title & Ecosystem Boost Pill */}
      <div className="op-network-head">
        <div className="op-network-head-main">
          <div className="op-network-tag-row">
            <span className="op-network-badge">Supply Chain Finance & Trust Graph</span>
            <span className="op-network-mode-badge">
              {viewMode === 'flow' ? 'Цепочка создания стоимости' : 'Экосистемный граф связей'}
            </span>
          </div>
          <h4 className="op-network-title">Экосистемный граф B2B-контрагентов</h4>
          <p className="op-network-subtitle">
            Анализ подтверждённых расчётов и связей с клиентами экосистемы Альфа-Банка для снижения кредитного риска
          </p>
        </div>

        {/* Ecosystem Boost Banner Pill */}
        <div className="op-boost-banner">
          <div className="op-boost-numbers">
            <span className="op-boost-plus">+{analysis.ecosystemBoostPoints} баллов</span>
            <span className="op-boost-sub">-{analysis.rateDiscountPercent.toFixed(1).replace('.', ',')}% к ставке</span>
          </div>
          <div className="op-boost-rationale">
            Замкнутость на банк <strong>{Math.round(analysis.alfaVolumeShare * 100)}%</strong> — прямой доступ к транзакциям контрагентов в Альфе подтверждает реальную выручку и исключает фиктивный оборот.
          </div>
        </div>
      </div>

      {/* 2. Mode Selector Bar */}
      <div className="op-network-toolbar">
        <div className="op-network-segmented">
          <SegmentedControl
            selectedId={viewMode}
            onChange={(id) => setViewMode(id as 'flow' | 'radial')}
            size={32}
          >
            <Segment id="flow" title="Цепочка поставок (Flow)" />
            <Segment id="radial" title="Карта связей (Radial Graph)" />
          </SegmentedControl>
        </div>
        <div className="op-network-metrics-summary">
          <div className="op-net-metric-item">
            <span className="op-metric-label">Всего контрагентов:</span>
            <strong>{analysis.nodes.length}</strong>
          </div>
          <div className="op-net-metric-item">
            <span className="op-metric-label">В контуре Альфа-Банка:</span>
            <strong className="op-text-positive">{analysis.nodes.filter(n => n.isAlfaClient).length} из {analysis.nodes.length}</strong>
          </div>
          <div className="op-net-metric-item">
            <span className="op-metric-label">Объём расчётов:</span>
            <strong>{formatRub(analysis.totalConnectedVolume)}</strong>
          </div>
        </div>
      </div>

      {/* 3. Main Visual Area */}
      <div className="op-network-stage">
        {viewMode === 'flow' ? (
          /* ================= MODE 1: FLOW ================= */
          <div className="op-flow-board">
            {/* SUPPLIERS LANE */}
            <div className="op-flow-lane op-flow-suppliers">
              <div className="op-lane-header">
                <span className="op-lane-title">Поставщики (Входящие поставки)</span>
                <span className="op-lane-count">{suppliers.length} партнёра</span>
              </div>
              <div className="op-lane-cards">
                {suppliers.map((node) => {
                  const isSelected = selectedNode?.id === node.id;
                  return (
                    <div
                      key={node.id}
                      className={`op-cp-card ${isSelected ? 'is-selected' : ''} ${node.isAlfaClient ? 'is-alfa' : ''}`}
                      onClick={() => setSelectedNode(node)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedNode(node); }}
                    >
                      <div className="op-cp-card-top">
                        <span className={`op-cp-badge ${node.isAlfaClient ? 'is-alfa' : 'is-external'}`}>
                          {node.isAlfaClient ? '● Клиент Альфа-Банка' : 'Внешний контрагент'}
                        </span>
                        <span className="op-cp-share">{node.sharePercent}% оборота</span>
                      </div>
                      <div className="op-cp-card-name" title={node.name}>{node.name}</div>
                      <div className="op-cp-card-foot">
                        <span className="op-cp-volume">{formatRub(node.volumeRub)}</span>
                        {node.isAlfaClient && (
                          <span className="op-cp-badge-years">{node.alfaClientYears} лет в банке</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* FLOW CONNECTOR: Suppliers -> Applicant */}
            <div className="op-flow-connector" aria-hidden="true">
              <svg className="op-flow-connector-svg" viewBox="0 0 48 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="flow-grad-in" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#0d9336" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#ef3124" stopOpacity="0.9" />
                  </linearGradient>
                </defs>
                <path d="M 4 20 C 24 20, 24 100, 44 100" fill="none" stroke="url(#flow-grad-in)" strokeWidth="3" strokeDasharray="5 3" />
                <path d="M 4 180 C 24 180, 24 100, 44 100" fill="none" stroke="url(#flow-grad-in)" strokeWidth="3" strokeDasharray="5 3" />
                <polygon points="44,95 48,100 44,105" fill="#ef3124" />
              </svg>
              <span className="op-flow-arrow-label">Сырьё & Товары →</span>
            </div>

            {/* APPLICANT LANE (CENTER) */}
            <div className="op-flow-center">
              <div className="op-flow-applicant-card">
                <div className="op-applicant-hero-badge">
                  <span className="op-alfa-symbol">A</span>
                  <span>Заявитель</span>
                </div>
                <h5 className="op-applicant-hero-name" title={companyName}>{companyName}</h5>
                <div className="op-applicant-hero-inn">ИНН: <code>{companyInn}</code></div>
                <div className="op-applicant-hero-rev">
                  <span className="op-rev-label">Годовая выручка:</span>
                  <span className="op-rev-val">{formatRub(annualRevenue)}</span>
                </div>
                <div className="op-applicant-hero-status">
                  <span className="op-applicant-verified-badge">✓ Экосистема проверена</span>
                </div>
              </div>
            </div>

            {/* FLOW CONNECTOR: Applicant -> Buyers */}
            <div className="op-flow-connector" aria-hidden="true">
              <svg className="op-flow-connector-svg" viewBox="0 0 48 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="flow-grad-out" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ef3124" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#0d9336" stopOpacity="0.7" />
                  </linearGradient>
                </defs>
                <path d="M 4 100 C 24 100, 24 20, 44 20" fill="none" stroke="url(#flow-grad-out)" strokeWidth="3" strokeDasharray="5 3" />
                <path d="M 4 100 C 24 100, 24 180, 44 180" fill="none" stroke="url(#flow-grad-out)" strokeWidth="3" strokeDasharray="5 3" />
                <polygon points="44,15 48,20 44,25" fill="#0d9336" />
                <polygon points="44,175 48,180 44,185" fill="#0d9336" />
              </svg>
              <span className="op-flow-arrow-label">Реализация →</span>
            </div>

            {/* BUYERS LANE */}
            <div className="op-flow-lane op-flow-buyers">
              <div className="op-lane-header">
                <span className="op-lane-title">Покупатели / Дебиторы</span>
                <span className="op-lane-count">{buyers.length} покупателя</span>
              </div>
              <div className="op-lane-cards">
                {buyers.map((node) => {
                  const isSelected = selectedNode?.id === node.id;
                  return (
                    <div
                      key={node.id}
                      className={`op-cp-card ${isSelected ? 'is-selected' : ''} ${node.isAlfaClient ? 'is-alfa' : ''}`}
                      onClick={() => setSelectedNode(node)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedNode(node); }}
                    >
                      <div className="op-cp-card-top">
                        <span className={`op-cp-badge ${node.isAlfaClient ? 'is-alfa' : 'is-external'}`}>
                          {node.isAlfaClient ? '● Клиент Альфа-Банка' : 'Внешний контрагент'}
                        </span>
                        <span className="op-cp-share">{node.sharePercent}% выручки</span>
                      </div>
                      <div className="op-cp-card-name" title={node.name}>{node.name}</div>
                      <div className="op-cp-card-foot">
                        <span className="op-cp-volume">{formatRub(node.volumeRub)}</span>
                        {node.isAlfaClient && (
                          <span className="op-cp-badge-years">{node.alfaClientYears} лет в банке</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* ================= MODE 2: RADIAL GRAPH ================= */
          <div className="op-radial-board">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="op-radial-svg"
              aria-label="Карта связей контрагентов экосистемы"
            >
              <defs>
                {/* Radial Hub Glow */}
                <radialGradient id="radial-hub-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#EF3124" stopOpacity="0.25" />
                  <stop offset="70%" stopColor="#EF3124" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#EF3124" stopOpacity="0.0" />
                </radialGradient>

                <linearGradient id="edge-alfa-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#EF3124" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#0d9336" stopOpacity="0.8" />
                </linearGradient>

                <filter id="card-shadow" x="-10%" y="-10%" width="120%" height="125%">
                  <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.08" />
                </filter>
                <filter id="hub-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="6" stdDeviation="12" floodOpacity="0.15" />
                </filter>
              </defs>

              {/* Ambient rings indicating trust concentric zones */}
              <circle cx={cx} cy={cy} r="255" fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 6" />
              <circle cx={cx} cy={cy} r="185" fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={cx} cy={cy} r="120" fill="url(#radial-hub-glow)" />

              {/* Connecting Edges */}
              {radialPositions.map(({ node, x: nx, y: ny }) => {
                const isSelected = selectedNode?.id === node.id;
                // Calculate smooth curve anchor
                const midX = (cx + nx) / 2;
                const midY = (cy + ny) / 2;

                return (
                  <g key={`edge-${node.id}`} className="op-radial-edge-group">
                    <line
                      x1={cx}
                      y1={cy}
                      x2={nx}
                      y2={ny}
                      stroke={node.isAlfaClient ? 'url(#edge-alfa-grad)' : '#cbd5e1'}
                      strokeWidth={isSelected ? 3.5 : node.isAlfaClient ? 2.5 : 1.5}
                      strokeDasharray={node.isAlfaClient ? '6 3' : 'none'}
                      opacity={isSelected ? 1 : 0.85}
                    />
                    {/* Midpoint Direction Badge */}
                    <circle
                      cx={midX}
                      cy={midY}
                      r="10"
                      fill={node.isAlfaClient ? '#0d9336' : '#64748b'}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <text
                      x={midX}
                      y={midY + 3.5}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#ffffff"
                      fontWeight="bold"
                    >
                      {node.role === 'BUYER' ? '←' : '→'}
                    </text>
                  </g>
                );
              })}

              {/* Center Hub: Applicant Card */}
              <g
                className="op-radial-applicant"
                transform={`translate(${cx - appW / 2}, ${cy - appH / 2})`}
              >
                <rect
                  width={appW}
                  height={appH}
                  rx="16"
                  fill="#0e1017"
                  stroke="#ef3124"
                  strokeWidth="2.5"
                  filter="url(#hub-shadow)"
                />
                <circle cx="28" cy="26" r="14" fill="#ef3124" />
                <text x="28" y="31" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#ffffff">A</text>

                <text x="50" y="22" fontSize="9" fontWeight="700" fill="#ef3124" letterSpacing="0.08em">
                  ЦЕНТР ЦЕПОЧКИ · ЗАЯВИТЕЛЬ
                </text>
                <text x="50" y="36" fontSize="10.5" fontWeight="700" fill="#ffffff">
                  {companyName.length > 22 ? `${companyName.slice(0, 20)}…` : companyName}
                </text>

                {/* Sub info */}
                <line x1="16" y1="46" x2={appW - 16} y2="46" stroke="#252b3b" strokeWidth="1" />
                <text x="16" y="62" fontSize="9" fill="#94a3b8">ИНН: {companyInn}</text>
                <text x="16" y="76" fontSize="10" fontWeight="600" fill="#38bdf8">
                  Выручка: {formatRub(annualRevenue)}
                </text>
              </g>

              {/* Counterparty Spacious Card Pills */}
              {radialPositions.map(({ node, x: nx, y: ny }) => {
                const isSelected = selectedNode?.id === node.id;
                const cardLeft = nx - pillW / 2;
                const cardTop = ny - pillH / 2;

                return (
                  <g
                    key={node.id}
                    className={`op-radial-node ${isSelected ? 'is-selected' : ''}`}
                    transform={`translate(${cardLeft}, ${cardTop})`}
                    onClick={() => setSelectedNode(node)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Background card with rounded corners */}
                    <rect
                      width={pillW}
                      height={pillH}
                      rx="14"
                      fill={isSelected ? '#ffffff' : node.isAlfaClient ? '#ffffff' : '#f8fafc'}
                      stroke={isSelected ? '#ef3124' : node.isAlfaClient ? '#10b981' : '#cbd5e1'}
                      strokeWidth={isSelected ? 2.5 : node.isAlfaClient ? 2 : 1}
                      filter="url(#card-shadow)"
                    />

                    {/* Top status bar inside pill */}
                    <rect
                      x="0"
                      y="0"
                      width={pillW}
                      height="5"
                      rx="2.5"
                      fill={node.isAlfaClient ? '#10b981' : '#94a3b8'}
                    />

                    {/* Header: Role Badge + Alfa Dot */}
                    <circle
                      cx="18"
                      cy="20"
                      r="4"
                      fill={node.isAlfaClient ? '#10b981' : '#94a3b8'}
                    />
                    <text
                      x="28"
                      y="23"
                      fontSize="9.5"
                      fontWeight="700"
                      fill={node.isAlfaClient ? '#059669' : '#64748b'}
                      letterSpacing="0.04em"
                    >
                      {node.role === 'BUYER' ? 'Покупатель' : 'Поставщик'}
                      {node.isAlfaClient ? ' · Альфа-Банк' : ''}
                    </text>

                    {/* Share percent badge */}
                    <rect
                      x={pillW - 54}
                      y="11"
                      width="42"
                      height="16"
                      rx="8"
                      fill={node.isAlfaClient ? '#dcfce7' : '#f1f5f9'}
                    />
                    <text
                      x={pillW - 33}
                      y="22.5"
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="700"
                      fill={node.isAlfaClient ? '#166534' : '#475569'}
                    >
                      {node.sharePercent}%
                    </text>

                    {/* Company Name (Adequate bounding box, clean font, truncated safely with room) */}
                    <text
                      x="14"
                      y="42"
                      fontSize="11"
                      fontWeight="600"
                      fill="#0f172a"
                    >
                      {node.name.length > 25 ? `${node.name.slice(0, 23)}…` : node.name}
                    </text>

                    {/* Bottom Volume & Client status */}
                    <text
                      x="14"
                      y="60"
                      fontSize="10"
                      fontWeight="700"
                      fill={node.isAlfaClient ? '#0d9336' : '#334155'}
                    >
                      {formatRub(node.volumeRub)}
                    </text>
                    {node.isAlfaClient && (
                      <text
                        x={pillW - 14}
                        y="60"
                        textAnchor="end"
                        fontSize="9"
                        fill="#059669"
                        fontWeight="600"
                      >
                        ✓ {node.alfaClientYears}г. в банке
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* 4. Interactive Details Modal / Sidebar Drawer */}
        <div className="op-network-inspector">
          {selectedNode ? (
            <div className="op-cp-details-panel">
              <div className="op-inspector-head">
                <span className={`op-node-tag ${selectedNode.isAlfaClient ? 'is-alfa' : 'is-external'}`}>
                  {selectedNode.isAlfaClient ? '● Клиент Альфа-Банка' : 'Внешний контрагент'}
                </span>
                <button
                  type="button"
                  className="op-inspector-close"
                  onClick={() => setSelectedNode(null)}
                  aria-label="Закрыть детали"
                >
                  ✕
                </button>
              </div>

              <div className="op-inspector-title">{selectedNode.name}</div>

              <div className="op-cp-meta-grid">
                <div className="op-cp-meta-row">
                  <span className="op-meta-label">Роль в цепочке:</span>
                  <strong>{selectedNode.role === 'BUYER' ? 'Покупатель (Дебитор)' : 'Поставщик (Кредитор)'}</strong>
                </div>
                <div className="op-cp-meta-row">
                  <span className="op-meta-label">ИНН организации:</span>
                  <code>{selectedNode.inn}</code>
                </div>
                <div className="op-cp-meta-row">
                  <span className="op-meta-label">Годовой объём расчётов:</span>
                  <strong className="op-text-ink">{formatRub(selectedNode.volumeRub)}</strong>
                </div>
                <div className="op-cp-meta-row">
                  <span className="op-meta-label">Доля в обороте заявителя:</span>
                  <strong>{selectedNode.sharePercent}%</strong>
                </div>
                <div className="op-cp-meta-row">
                  <span className="op-meta-label">Статус проверки платежей:</span>
                  {selectedNode.isAlfaClient ? (
                    <span className="op-status-verified">✓ 100% подтверждено транзакциями банка</span>
                  ) : (
                    <span className="op-status-external">⚠ Внешний контрагент (проверка по 1С)</span>
                  )}
                </div>
                {selectedNode.isAlfaClient && selectedNode.alfaClientYears && (
                  <div className="op-cp-meta-row">
                    <span className="op-meta-label">История в Альфа-Банке:</span>
                    <strong className="op-text-positive">{selectedNode.alfaClientYears} лет надёжных расчётов</strong>
                  </div>
                )}
                <div className="op-cp-meta-row">
                  <span className="op-meta-label">Оценка риска контрагента:</span>
                  <span className={`op-risk-badge is-${selectedNode.riskRating.toLowerCase()}`}>
                    {selectedNode.riskRating === 'LOW' ? 'Низкий риск (A+)' : selectedNode.riskRating === 'MEDIUM' ? 'Умеренный риск (B)' : 'Повышенный риск'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="op-inspector-empty">
              <span className="op-inspector-hint-icon">👆</span>
              <div className="op-inspector-hint-text">
                <strong>Инспекция контрагента</strong>
                <span>Нажмите на любую карточку в цепочке или на графе, чтобы посмотреть подтверждённый объём расчётов и профиль риска.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. Footer with Transparency & Risk Methodology */}
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
