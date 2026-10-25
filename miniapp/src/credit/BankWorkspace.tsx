// Bank workspace (demo role): the internal view of the same CreditApplication — a dense working tool, not a client page.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@alfalab/core-components-button';
import { Input } from '@alfalab/core-components-input';
import { Tabs, Tab } from '@alfalab/core-components-tabs';
import { Table } from '@alfalab/core-components-table';
import { SegmentedControl, Segment } from '@alfalab/core-components-segmented-control';
import { ArrowBackMIcon } from '@alfalab/icons-glyph/ArrowBackMIcon';
import { ArrowsCwMIcon } from '@alfalab/icons-glyph/ArrowsCwMIcon';
import { MagnifierMIcon } from '@alfalab/icons-glyph/MagnifierMIcon';
import { creditApi, type BankRow, type BankView } from './api';
import { ErrorNote, Facts, formatPercent, Loading, Money, OutcomeBadge, ProgressBar, Rate, ReasonList, StatusBadge, SyntheticBadge, useCompact } from './ui';
import { errorMessage, formatDate, formatDateTime, months } from './format';
import { navigate } from './routes';
import { checkStatusLabels, clientStateLabels, documentLabels, outcomeLabels, providerLabels, purposeLabels, riskLabels } from '../../api-server/credit/labels';
import { processingStates } from '../../api-server/credit/state-machine';
import type { ApplicationState, RiskLevel } from '../../api-server/credit/types';
import { CashFlowSimulator } from './CashFlowSimulator';
import { ModelGovernance } from './ModelGovernance';

const payloadLabels: Record<string, string> = {
  active: 'Действует', registrationDate: 'Дата регистрации', okved: 'ОКВЭД', activeDebt: 'Действующий долг', overdueAmount: 'Сумма просрочки',
  maxDaysOverdue: 'Макс. просрочка, дн.', hasHistory: 'Есть история', activeLoans: 'Действующих кредитов', latePayments12m: 'Просрочек за 12 мес.',
  revenue: 'Выручка', expenses: 'Расходы', profit: 'Прибыль', currentDebt: 'Текущий долг', period: 'Период', source: 'Источник',
};
const moneyKeys = new Set(['activeDebt', 'overdueAmount', 'revenue', 'expenses', 'profit', 'currentDebt']);
const payloadValue = (key: string, value: unknown) =>
  typeof value === 'boolean' ? (value ? 'да' : 'нет') : moneyKeys.has(key) && typeof value === 'number' ? <Money value={value} /> : String(value ?? '—');

function RiskBadge({ risk }: { risk: RiskLevel | null }) {
  return risk ? <span className={`op-risk op-risk-${risk.toLowerCase()}`}>{riskLabels[risk]}</span> : <span className="op-muted">—</span>;
}
function ScoreCell({ score }: { score: number | null }) {
  if (score === null) return <span className="op-muted">—</span>;
  return <span className="op-score-cell" data-band={score >= 75 ? 'low' : score >= 60 ? 'medium' : 'high'}>
    <strong>{score}</strong><span className="op-score-track"><span style={{ width: `${score}%` }} /></span></span>;
}
const mlText = (p: number | null) => p === null ? '—' : formatPercent(Math.round(p * 1000) / 10);

/** Internal pipeline stages derived from the event history of the current attempt. */
const pipeline: { label: string; states: ApplicationState[] }[] = [
  { label: 'APPLICATION RECEIVED', states: ['SUBMITTED'] }, { label: 'VALIDATION', states: ['VALIDATING'] },
  { label: 'EXTERNAL CHECKS', states: ['ENRICHING'] }, { label: 'RISK ASSESSMENT', states: ['RISK_ASSESSMENT'] },
  { label: 'SCORING', states: ['SCORING'] }, { label: 'DECISION', states: ['DECISION'] },
  { label: 'RESULT', states: ['APPROVED', 'COUNTER_OFFER', 'NEEDS_INFO', 'REJECTED'] },
];
function Pipeline({ view }: { view: BankView }) {
  const events = view.events, start = events.map((e) => e.toState).lastIndexOf('SUBMITTED');
  const reached = new Set(start < 0 ? [] : events.slice(start).map((e) => e.toState));
  return <ol className="op-pipeline" aria-label="Внутренний процесс">{pipeline.map((stage) => {
    const done = stage.states.some((s) => reached.has(s));
    const resultState = stage.label === 'RESULT' ? stage.states.find((s) => reached.has(s)) : undefined;
    return <li key={stage.label} data-done={done}><span aria-hidden="true">{done ? '✓' : '·'}</span>{stage.label}{resultState ? `: ${resultState}` : ''}</li>;
  })}</ol>;
}

type Filter = 'all' | 'work' | 'decided' | 'financed' | 'rejected';
const filters: { id: Filter; title: string; test: (row: BankRow) => boolean }[] = [
  { id: 'all', title: 'Все', test: () => true },
  { id: 'work', title: 'В работе', test: (r) => (['DRAFT', 'DATA_COLLECTION', 'READY_TO_SUBMIT', 'NEEDS_INFO', ...processingStates] as ApplicationState[]).includes(r.state) },
  { id: 'decided', title: 'Решение', test: (r) => ['APPROVED', 'COUNTER_OFFER', 'OFFER_ACCEPTED', 'COMPLETED'].includes(r.state) },
  { id: 'financed', title: 'Выдано', test: (r) => r.state === 'ACTIVE_FINANCING' },
  { id: 'rejected', title: 'Отказ', test: (r) => r.state === 'REJECTED' },
];

export function BankWorkspace({ selectedId }: { selectedId?: string }) {
  return selectedId ? <BankApplication id={selectedId} /> : <BankList />;
}

function BankList() {
  const [rows, setRows] = useState<BankRow[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'applications' | 'governance'>('applications');
  const load = useCallback((signal?: AbortSignal) => {
    setError('');
    creditApi.bankApplications(signal).then((data) => setRows(data.applications)).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
  }, []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  const open = (id: string) => navigate({ name: 'bank-application', id });
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase(), test = filters.find((f) => f.id === filter)!.test;
    return (rows ?? []).filter((r) => test(r) && (!q || `${r.number} ${r.companyName} ${r.companyInn}`.toLowerCase().includes(q)));
  }, [rows, filter, query]);
  const kpi = useMemo(() => {
    const all = rows ?? [], decided = all.filter((r) => r.outcome && r.outcome !== 'NEEDS_INFO');
    const positive = decided.filter((r) => r.outcome === 'APPROVED' || r.outcome === 'COUNTER_OFFER');
    const scored = all.filter((r) => r.score !== null);
    return { total: all.length, work: all.filter(filters[1].test).length,
      approval: decided.length ? positive.length / decided.length : null,
      score: scored.length ? Math.round(scored.reduce((s, r) => s + r.score!, 0) / scored.length) : null,
      highRisk: all.filter((r) => r.mlRiskLevel === 'HIGH').length,
      financed: all.filter((r) => r.state === 'ACTIVE_FINANCING').reduce((s, r) => s + (r.requestedAmount ?? 0), 0) };
  }, [rows]);
  return <div className="op-bank">
    <header className="op-bank-header">
      <div>
        <span className="op-bank-crumbs">Кредитный конвейер / {viewMode === 'applications' ? 'Заявки' : 'Аудит модели риска'}</span>
        <h1>{viewMode === 'applications' ? 'Заявки' : 'Аудит модели риска'}</h1>
      </div>
      <div className="op-row">
        <SegmentedControl selectedId={viewMode} onChange={(id) => setViewMode(id as 'applications' | 'governance')} size={32}>
          <Segment id="applications" title="Заявки" />
          <Segment id="governance" title="Аудит модели (Governance)" />
        </SegmentedControl>
        <SyntheticBadge text="Демо-роль; проверки, модель риска и решения синтетические" />
        {viewMode === 'applications' && <Button view="secondary" size={40} leftAddons={<ArrowsCwMIcon />} onClick={() => load()}>Обновить</Button>}
      </div>
    </header>
    {viewMode === 'governance' ? <ModelGovernance /> : <>
      {error && <ErrorNote error={error} onRetry={() => load()} />}
      {!rows && !error && <Loading text="Загружаем заявки…" />}
      {rows && <>
      <div className="op-kpis">
        <div className="op-kpi"><span>Всего заявок</span><strong>{kpi.total}</strong></div>
        <div className="op-kpi"><span>В работе</span><strong>{kpi.work}</strong></div>
        <div className="op-kpi"><span>Одобрено из решённых</span><strong>{kpi.approval === null ? '—' : `${Math.round(kpi.approval * 100)}%`}</strong></div>
        <div className="op-kpi"><span>Средний скоринг</span><strong>{kpi.score ?? '—'}</strong></div>
        <div className="op-kpi" data-alert={kpi.highRisk > 0 || undefined}><span>Высокий ML-риск</span><strong>{kpi.highRisk}</strong></div>
        <div className="op-kpi"><span>Выдано (симуляция)</span><strong><Money value={kpi.financed} /></strong></div>
      </div>
      <div className="op-bank-toolbar">
        <div className="op-bank-filter"><SegmentedControl selectedId={filter} onChange={(id) => setFilter(id as Filter)} size={40}>
          {filters.map((f) => <Segment key={f.id} id={f.id} title={`${f.title} · ${(rows ?? []).filter(f.test).length}`} />)}
        </SegmentedControl></div>
        <div className="op-bank-search"><Input size={40} block placeholder="Номер, компания или ИНН" value={query} leftAddons={<MagnifierMIcon />}
          onChange={(_, { value }) => setQuery(value)} aria-label="Поиск заявок" clear onClear={() => setQuery('')} /></div>
      </div>
      {shown.length ? <>
        <div className="op-table-wrap op-desktop-only">
          <Table className="op-table">
            <Table.THead>
              <Table.THeadCell>Заявка</Table.THeadCell><Table.THeadCell>Компания</Table.THeadCell>
              <Table.THeadCell textAlign="right">Сумма / срок</Table.THeadCell><Table.THeadCell>Продукт</Table.THeadCell>
              <Table.THeadCell>Состояние</Table.THeadCell><Table.THeadCell>Скоринг</Table.THeadCell>
              <Table.THeadCell>ML-риск</Table.THeadCell><Table.THeadCell>Решение</Table.THeadCell><Table.THeadCell>Обновлена</Table.THeadCell>
            </Table.THead>
            <Table.TBody>{shown.map((row) => <Table.TRow key={row.id} onClick={() => open(row.id)} className="op-table-row">
              <Table.TCell><a href={`#/bank/applications/${row.id}`} className="op-mono">{row.number}</a></Table.TCell>
              <Table.TCell><strong>{row.companyName}</strong><br /><span className="op-muted op-small op-mono">{row.companyInn}</span>
                <span className="op-tag" data-kind={row.relationship}>{row.relationship === 'client' ? 'клиент' : 'не клиент'}</span></Table.TCell>
              <Table.TCell className="op-num">{row.requestedAmount ? <Money value={row.requestedAmount} /> : '—'}<br />
                <span className="op-muted op-small">{row.requestedTermMonths ? months(row.requestedTermMonths) : ''}</span></Table.TCell>
              <Table.TCell>{row.productName ?? <span className="op-muted">—</span>}</Table.TCell>
              <Table.TCell><StatusBadge state={row.state} internal /></Table.TCell>
              <Table.TCell><ScoreCell score={row.score} /></Table.TCell>
              <Table.TCell><span className="op-mono">{mlText(row.mlProbability)}</span> <RiskBadge risk={row.mlRiskLevel} /></Table.TCell>
              <Table.TCell>{row.outcome ? <OutcomeBadge outcome={row.outcome} /> : <span className="op-muted">—</span>}</Table.TCell>
              <Table.TCell className="op-muted op-small">{formatDateTime(row.updatedAt)}</Table.TCell>
            </Table.TRow>)}</Table.TBody>
          </Table>
        </div>
        <div className="op-mobile-only op-list">{shown.map((row) => <button key={row.id} type="button" className="op-application-card op-bank-row" onClick={() => open(row.id)}>
          <span className="op-row"><strong className="op-mono">{row.number}</strong><StatusBadge state={row.state} internal /></span>
          <span className="op-bank-row-company"><strong>{row.companyName}</strong>
            <span className="op-tag" data-kind={row.relationship}>{row.relationship === 'client' ? 'клиент' : 'не клиент'}</span></span>
          <span className="op-bank-row-amount">{row.requestedAmount ? <Money value={row.requestedAmount} /> : '—'}
            <span className="op-muted">{row.requestedTermMonths ? ` · ${months(row.requestedTermMonths)}` : ''}{row.productName ? ` · ${row.productName}` : ''}</span></span>
          <span className="op-bank-row-metrics">
            <span><small>Скоринг</small><ScoreCell score={row.score} /></span>
            <span><small>ML-риск</small>{row.mlProbability === null ? <span className="op-muted">—</span>
              : <span><span className="op-mono">{mlText(row.mlProbability)}</span> <RiskBadge risk={row.mlRiskLevel} /></span>}</span>
            <span><small>Решение</small>{row.outcome ? <OutcomeBadge outcome={row.outcome} /> : <span className="op-muted">—</span>}</span>
          </span>
        </button>)}</div>
      </> : <p className="op-empty">{rows.length ? 'Нет заявок по этому фильтру.' : 'Заявок пока нет. Откройте клиентский кабинет и создайте заявку.'}</p>}
    </>}</>}
  </div>;
}

type TabId = 'overview' | 'checks' | 'risk' | 'decision' | 'stress' | 'history';
function BankApplication({ id }: { id: string }) {
  const [view, setView] = useState<BankView | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabId>('overview');
  const compact = useCompact();
  useEffect(() => {
    const controller = new AbortController();
    creditApi.bankApplication(id, controller.signal).then(setView).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
    return () => controller.abort();
  }, [id]);
  const back = <a className="op-back" href="#/bank"><ArrowBackMIcon aria-hidden="true" />Все заявки</a>;
  if (error) return <div className="op-bank">{back}<ErrorNote error={error} /></div>;
  if (!view) return <div className="op-bank">{back}<Loading text="Загружаем заявку…" /></div>;
  const { application: app, company, scoring, decision, riskAssessment: risk } = view;
  return <div className="op-bank op-bank-detail">
    {back}
    <header className="op-bank-header">
      <div>
        <span className="op-bank-crumbs">Заявки / <span className="op-mono">{app.number}</span></span>
        <h1>{company.name}</h1>
        <span className="op-muted op-small"><span className="op-mono">ИНН {company.inn}</span> · {company.relationship === 'client' ? 'клиент банка' : 'не клиент банка'} · попытка {app.attempt}</span>
      </div>
      <StatusBadge state={app.state} internal />
    </header>
    <div className="op-kpis op-kpis-detail">
      <div className="op-kpi"><span>Запрошено</span><strong>{app.requestedAmount ? <Money value={app.requestedAmount} /> : '—'}</strong>
        <small>{app.requestedTermMonths ? months(app.requestedTermMonths) : ''}</small></div>
      <div className="op-kpi"><span>Продукт</span><strong className="op-kpi-text">{view.product?.name ?? '—'}</strong></div>
      <div className="op-kpi"><span>Скоринг</span><strong>{scoring ? scoring.score : '—'}</strong><small>{scoring ? <RiskBadge risk={scoring.riskLevel} /> : null}</small></div>
      <div className="op-kpi" data-alert={risk?.riskLevel === 'HIGH' || undefined}><span>ML-риск</span><strong>{risk ? mlText(risk.probability) : '—'}</strong>
        <small>{risk ? <RiskBadge risk={risk.riskLevel} /> : 'не применялась'}</small></div>
      <div className="op-kpi"><span>Решение</span><strong className="op-kpi-outcome" data-outcome={decision?.outcome}>{decision ? outcomeLabels[decision.outcome] : '—'}</strong></div>
      <div className="op-kpi"><span>Полнота</span><strong>{Math.round(view.readiness.completeness * 100)}%</strong></div>
    </div>
    <section className="op-card op-bank-card">
      <Pipeline view={view} />
      <Tabs selectedId={tab} onChange={(_, { selectedId }) => setTab(selectedId as TabId)} scrollable size={compact ? 'm' : 's'}>
        <Tab id="overview" title="Обзор"><div className="op-tab op-grid-2">
          <Facts items={[
            ['Состояние', `${app.state} — ${clientStateLabels[app.state].title}`], ['Продукт', view.product?.name ?? '—'],
            ['Цель', app.purpose ? purposeLabels[app.purpose] : '—'],
            ['Запрошено', app.requestedAmount ? <><Money value={app.requestedAmount} /> на {months(app.requestedTermMonths ?? 0)}</> : '—'],
            ['Попытка подачи', String(app.attempt)], ['Полнота анкеты', `${Math.round(view.readiness.completeness * 100)}%`],
            ['Описание цели', app.purposeDescription || '—'],
          ]} />
          <div className="op-stack">
            {company.isSynthetic && <SyntheticBadge />}
            <Facts items={[
              ['Клиент', company.relationship === 'client' ? 'клиент банка' : 'не клиент банка'], ['Компания', company.name], ['ИНН', company.inn],
              ['Регистрация', formatDate(company.registrationDate)], ['ОКВЭД', company.okved], ['Регион', company.region],
              ['Источник профиля', company.relationship === 'client' ? 'данные банка (синтетические)' : company.source],
              ['Заявленные показатели', app.declaredFinancials ? <>выручка <Money value={app.declaredFinancials.revenue} />, расходы <Money value={app.declaredFinancials.expenses} />,
                долг <Money value={app.declaredFinancials.currentDebt} />{app.declaredFinancials.activeLoans !== undefined ? `, кредитов ${app.declaredFinancials.activeLoans}` : ''}</> : 'не указаны'],
              ['Кредитная история (анкета)', app.declaredCreditHistory ? (app.declaredCreditHistory.hadOverdue12m ? `просрочки до ${app.declaredCreditHistory.maxOverdueDays} дн.` : 'без просрочек') : 'не указана'],
            ]} />
            <ProgressBar value={view.readiness.completeness} label="Полнота анкеты" />
            {view.documents.length > 0 && <ul className="op-plain">{view.documents.map((d) => <li key={d.id}>
              {documentLabels[d.type]} — {d.fileName} <span className="op-muted">({Math.round(d.sizeBytes / 1024)} КБ)</span></li>)}</ul>}
          </div>
        </div></Tab>
        <Tab id="checks" title="Проверки (mock)"><div className="op-tab">
          {view.checks.length ? <div className="op-checks-grid">{view.checks.map((check) => <article key={check.id} className="op-check" data-status={check.status}>
            <header><strong>{providerLabels[check.provider].bank}</strong><span className="op-pill op-mono">{check.status} · {checkStatusLabels[check.status]}</span></header>
            {check.payload ? <dl className="op-facts op-facts-compact">{Object.entries(check.payload).map(([key, value]) =>
              <div key={key}><dt>{payloadLabels[key] ?? key}</dt><dd>{payloadValue(key, value)}</dd></div>)}</dl> : <p className="op-muted">Нет данных</p>}
            <small className="op-muted">{formatDateTime(check.checkedAt)}</small>
          </article>)}</div> : <p className="op-empty">Проверки ещё не выполнялись.</p>}
        </div></Tab>
        <Tab id="risk" title="Риск и скоринг"><div className="op-tab op-grid-2">
          <div className="op-analytic">
            <h3>ML-модель риска</h3>
            {risk ? <>
              <p className="op-score"><strong>{mlText(risk.probability)}</strong> вероятность проблемного обслуживания (12 мес.) <RiskBadge risk={risk.riskLevel} /></p>
              <ul className="op-shap">{risk.topFactors.map((f) => <li key={f.feature} data-impact={f.impact}>
                <span className="op-shap-dir" aria-hidden="true">{f.impact === 'positive' ? '↓' : '↑'}</span>
                <span>{f.text}<small className="op-muted op-mono"> {f.feature}</small></span></li>)}</ul>
              <p className="op-muted op-small">Модель {risk.modelVersion}, демо: обучена на синтетических данных. Входит в решение как один из факторов — не принимает его сама.</p>
            </> : <p className="op-empty">{view.riskModelVersion ? 'Модель не применялась: недостаточно финансовых данных.' : 'Модель риска не подключена.'}</p>}
          </div>
          <div className="op-analytic">
            <h3>Детерминированный скоринг</h3>
            {scoring ? <>
              <p className="op-score"><strong>{scoring.score}</strong>/100 <RiskBadge risk={scoring.riskLevel} /></p>
              {!scoring.dataComplete && <p className="op-field-error">Часть факторов рассчитана без данных и получила 0 баллов.</p>}
              <ul className="op-factors">{scoring.factors.map((factor) => <li key={factor.code} data-effect={factor.effect}>
                <div><strong>{factor.title}</strong><span className="op-mono">{factor.impact} / {factor.maxImpact}</span></div>
                <span className="op-factor-bar"><span style={{ width: `${(factor.impact / factor.maxImpact) * 100}%` }} /></span>
                <small className="op-muted"><span className="op-mono">{factor.code}</span> · {factor.explanation}</small>
              </li>)}</ul>
            </> : <p className="op-empty">Оценка ещё не рассчитана.</p>}
          </div>
        </div></Tab>
        <Tab id="decision" title="Решение"><div className="op-tab">
          {decision ? <>
            <div className="op-row"><OutcomeBadge outcome={decision.outcome} /><span>{decision.summary}</span></div>
            {decision.offer && <Facts items={[['Продукт', view.offerProduct?.name ?? decision.offer.productId], ['Сумма', <Money key="a" value={decision.offer.amount} />],
              ['Срок', months(decision.offer.termMonths)], ['Ставка', <Rate key="r" rate={decision.offer.rate} pricing={decision.offer.pricing} />],
              ['Платёж', <Money key="p" value={decision.offer.monthlyPayment} />]]} />}
            <h3>Причины</h3>
            <ReasonList reasons={decision.reasons} />
            {decision.requiredInfo.length > 0 && <><h3>Запрошено у клиента</h3><ul className="op-plain">{decision.requiredInfo.map((i) => <li key={i.code}>{i.text}</li>)}</ul></>}
            <p className="op-muted op-small">Решение = правила CreditDecisionEngine (стоп-факторы, пороги скоринга, платёжеспособность, продуктовые ограничения) с учётом ML-риска.</p>
          </> : <p className="op-empty">Решение ещё не сформировано.</p>}
          {view.financing && <Facts items={[['Финансирование', `${view.financing.status} (симуляция)`], ['Остаток', <Money key="o" value={view.financing.remainingPrincipal} />],
            ['Оплачено платежей', `${view.financing.paidInstallments} из ${view.financing.termMonths}`]]} />}
        </div></Tab>
        <Tab id="stress" title="Стресс-тест кассы"><div className="op-tab">
          {((company.financials ?? app.declaredFinancials)) ? (
            <CashFlowSimulator
              annualRevenue={(company.financials ?? app.declaredFinancials)!.revenue}
              annualExpenses={(company.financials ?? app.declaredFinancials)!.expenses || (company.financials ?? app.declaredFinancials)!.revenue * 0.8}
              loanAmount={decision?.offer?.amount ?? app.acceptedOffer?.amount ?? view.financing?.amount ?? app.requestedAmount ?? 1_000_000}
              loanRate={decision?.offer?.rate ?? app.acceptedOffer?.rate ?? view.financing?.rate ?? 19.5}
              loanTermMonths={decision?.offer?.termMonths ?? app.acceptedOffer?.termMonths ?? view.financing?.termMonths ?? app.requestedTermMonths ?? 12}
              existingDebt={(company.financials ?? app.declaredFinancials)!.currentDebt || 0}
            />
          ) : (
            <p className="op-empty">Для расчёта стресс-теста требуются финансовые показатели компании (выручка и расходы).</p>
          )}
        </div></Tab>
        <Tab id="history" title="История"><div className="op-tab">
          <ol className="op-events">{view.events.map((event) => <li key={event.id}>
            <span className="op-muted op-mono">#{event.sequence} · {formatDateTime(event.createdAt)} · {event.type}</span>
            <strong>{event.fromState || event.toState ? `${event.fromState ?? '∅'} → ${event.toState ?? '∅'}` : event.message}</strong>
            {(event.fromState || event.toState) && <span>{event.message}</span>}
            {event.payload && <code>{JSON.stringify(event.payload)}</code>}
          </li>)}</ol>
        </div></Tab>
      </Tabs>
    </section>
  </div>;
}
