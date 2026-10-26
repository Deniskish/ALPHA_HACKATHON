// B2B Counterparty Network and Alfa Ecosystem Trust Graph
import { useState } from 'react';
import { SegmentedControl, Segment } from '@alfalab/core-components-segmented-control';
import { Table } from '@alfalab/core-components-table';
import { analyzeCounterpartyEcosystem, type CounterpartyNode } from './ecosystem';
import { formatRub } from './format';
import { Money } from './ui';

export interface B2BNetworkGraphProps {
  companyInn: string;
  companyName: string;
  annualRevenue: number;
}

export function B2BNetworkGraph({
  companyInn,
  companyName,
  annualRevenue,
}: B2BNetworkGraphProps) {
  const analysis = analyzeCounterpartyEcosystem(companyInn, annualRevenue);
  const [activeTab, setActiveTab] = useState<'flow' | 'table'>('flow');
  const [selectedId, setSelectedId] = useState<string | null>(analysis.nodes[0]?.id ?? null);

  const suppliers = analysis.nodes.filter((n) => n.role === 'SUPPLIER');
  const buyers = analysis.nodes.filter((n) => n.role === 'BUYER');
  const selectedNode = analysis.nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <section className="op-network-card" aria-labelledby="b2b-network-title" data-testid="b2b-network-graph">
      {/* 1. Clean Header without overlapping tags */}
      <div className="op-network-header">
        <div className="op-network-titles">
          <span className="op-network-eyebrow">Supply Chain Finance</span>
          <h3 id="b2b-network-title" className="op-network-heading">
            Связи в экосистеме Альфа-Банка
          </h3>
          <p className="op-network-desc">
            Анализ подтверждённых расчётов с клиентами банка для снижения кредитного риска и ставки
          </p>
        </div>

        <div className="op-network-boost-badge">
          <div className="op-boost-tag">Экосистемный буст</div>
          <div className="op-boost-numbers">
            <span className="op-boost-points">+{analysis.ecosystemBoostPoints} баллов</span>
            <span className="op-boost-rate">скидка -{analysis.rateDiscountPercent.toFixed(1).replace('.', ',')}%</span>
          </div>
        </div>
      </div>

      {/* 2. Control Toolbar */}
      <div className="op-network-bar">
        <SegmentedControl
          selectedId={activeTab}
          onChange={(id) => setActiveTab(id as 'flow' | 'table')}
          size={40}
        >
          <Segment id="flow" title="Цепочка расчётов" />
          <Segment id="table" title={`Реестр контрагентов (${analysis.nodes.length})`} />
        </SegmentedControl>

        <div className="op-network-stats-row">
          <span className="op-stat-item">
            Замкнутость на банк: <strong className="op-text-positive">{Math.round(analysis.alfaVolumeShare * 100)}%</strong>
          </span>
          <span className="op-stat-divider">·</span>
          <span className="op-stat-item">
            Объём расчётов: <strong>{formatRub(analysis.totalConnectedVolume)}</strong>
          </span>
        </div>
      </div>

      {/* 3. Main Content: Flow or Table */}
      {activeTab === 'flow' ? (
        <div className="op-flow-canvas">
          {/* Lane 1: Suppliers */}
          <div className="op-flow-col">
            <div className="op-col-header">
              <span className="op-col-title">Поставщики ({suppliers.length})</span>
              <span className="op-col-subtitle">Закупка сырья и услуг</span>
            </div>
            <div className="op-col-cards">
              {suppliers.map((node) => (
                <CounterpartyCard
                  key={node.id}
                  node={node}
                  isSelected={node.id === selectedId}
                  onClick={() => setSelectedId(node.id)}
                />
              ))}
            </div>
          </div>

          {/* Lane 2: Flow Direction & Applicant Hub */}
          <div className="op-flow-center-col">
            <div className="op-flow-direction-arrow">→ входящие поставки →</div>
            <div className="op-hub-applicant">
              <div className="op-hub-badge">Заявитель</div>
              <h4 className="op-hub-name" title={companyName}>{companyName}</h4>
              <div className="op-hub-inn">ИНН {companyInn}</div>
              <div className="op-hub-revenue">
                <span className="op-muted op-small">Годовая выручка:</span>
                <strong>{formatRub(annualRevenue)}</strong>
              </div>
              <div className="op-hub-verified">
                <span className="op-check-dot">✓</span> Торговый оборот подтверждён
              </div>
            </div>
            <div className="op-flow-direction-arrow">→ реализация покупателям →</div>
          </div>

          {/* Lane 3: Buyers */}
          <div className="op-flow-col">
            <div className="op-col-header">
              <span className="op-col-title">Покупатели ({buyers.length})</span>
              <span className="op-col-subtitle">Дебиторская задолженность</span>
            </div>
            <div className="op-col-cards">
              {buyers.map((node) => (
                <CounterpartyCard
                  key={node.id}
                  node={node}
                  isSelected={node.id === selectedId}
                  onClick={() => setSelectedId(node.id)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Tab 2: Structured Enterprise Table */
        <div className="op-table-wrap">
          <Table className="op-table">
            <Table.THead>
              <Table.THeadCell>Контрагент</Table.THeadCell>
              <Table.THeadCell>Роль в цепочке</Table.THeadCell>
              <Table.THeadCell textAlign="right">Доля в обороте</Table.THeadCell>
              <Table.THeadCell textAlign="right">Годовой объём</Table.THeadCell>
              <Table.THeadCell>Статус в Альфа-Банке</Table.THeadCell>
            </Table.THead>
            <Table.TBody>
              {analysis.nodes.map((node) => (
                <Table.TRow
                  key={node.id}
                  onClick={() => setSelectedId(node.id)}
                  className={`op-table-row ${node.id === selectedId ? 'is-selected' : ''}`}
                >
                  <Table.TCell>
                    <strong>{node.name}</strong>
                    <br />
                    <span className="op-muted op-small op-mono">ИНН {node.inn}</span>
                  </Table.TCell>
                  <Table.TCell>
                    <span className="op-role-pill" data-role={node.role}>
                      {node.role === 'BUYER' ? 'Покупатель (Дебитор)' : 'Поставщик'}
                    </span>
                  </Table.TCell>
                  <Table.TCell className="op-num op-text-right">
                    <strong>{node.sharePercent}%</strong>
                  </Table.TCell>
                  <Table.TCell className="op-num op-text-right">
                    <Money value={node.volumeRub} />
                  </Table.TCell>
                  <Table.TCell>
                    {node.isAlfaClient ? (
                      <span className="op-alfa-verified-tag">
                        ● Клиент банка ({node.alfaClientYears} лет)
                      </span>
                    ) : (
                      <span className="op-external-tag">Внешний контрагент</span>
                    )}
                  </Table.TCell>
                </Table.TRow>
              ))}
            </Table.TBody>
          </Table>
        </div>
      )}

      {/* 4. Selected Counterparty Inspection Box */}
      {selectedNode && (
        <div className="op-counterparty-inspector">
          <div className="op-inspector-head">
            <div className="op-inspector-title-group">
              <span className="op-inspector-role">
                {selectedNode.role === 'BUYER' ? 'Дебитор (Покупатель)' : 'Кредитор (Поставщик)'}
              </span>
              <strong className="op-inspector-name">{selectedNode.name}</strong>
              <span className="op-muted op-small">ИНН {selectedNode.inn}</span>
            </div>
            {selectedNode.isAlfaClient ? (
              <span className="op-alfa-verified-pill">
                ✓ Обслуживается в Альфа-Банке {selectedNode.alfaClientYears} лет
              </span>
            ) : (
              <span className="op-external-pill">Внешняя банковская организация</span>
            )}
          </div>

          <div className="op-inspector-metrics">
            <div className="op-insp-metric">
              <span className="op-muted op-small">Объём операций</span>
              <strong>{formatRub(selectedNode.volumeRub)}</strong>
            </div>
            <div className="op-insp-metric">
              <span className="op-muted op-small">Доля в расчётах</span>
              <strong>{selectedNode.sharePercent}%</strong>
            </div>
            <div className="op-insp-metric">
              <span className="op-muted op-small">Рейтинг риска</span>
              <span className={`op-risk-dot op-risk-${selectedNode.riskRating.toLowerCase()}`}>
                ● {selectedNode.riskRating === 'LOW' ? 'Низкий риск' : 'Умеренный риск'}
              </span>
            </div>
            <div className="op-insp-metric">
              <span className="op-muted op-small">Верификация ФНС</span>
              <span className="op-text-positive">✓ Действующее ЮЛ</span>
            </div>
          </div>
        </div>
      )}

      {/* 5. Summary Explanation Banner */}
      <div className="op-network-rationale-box">
        <strong>Экосистемный эффект: </strong>
        <span>{analysis.rationale}</span>
      </div>
    </section>
  );
}

function CounterpartyCard({
  node,
  isSelected,
  onClick,
}: {
  node: CounterpartyNode;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`op-flow-card ${isSelected ? 'is-selected' : ''} ${node.isAlfaClient ? 'is-alfa' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
    >
      <div className="op-card-row-top">
        <span className="op-card-role-label">
          {node.role === 'BUYER' ? 'Покупатель' : 'Поставщик'}
        </span>
        <span className="op-card-share-label">{node.sharePercent}% оборота</span>
      </div>

      <div className="op-card-company-name" title={node.name}>
        {node.name}
      </div>

      <div className="op-card-row-bottom">
        <span className="op-card-amount">{formatRub(node.volumeRub)}</span>
        {node.isAlfaClient ? (
          <span className="op-card-alfa-badge" title="Счёт в Альфа-Банке">
            ● Альфа-Банк
          </span>
        ) : (
          <span className="op-card-ext-badge">Внешний</span>
        )}
      </div>
    </div>
  );
}
