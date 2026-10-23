// Bank side (demo role): internal view of the same CreditApplication the client works with.
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@alfalab/core-components-button';
import { Tabs, Tab } from '@alfalab/core-components-tabs';
import { creditApi, type BankRow, type BankView } from './api';
import { ErrorNote, Facts, Loading, OutcomeBadge, ProgressBar, ReasonList, Section, StatusBadge, SyntheticBadge } from './ui';
import { errorMessage, formatDate, formatDateTime, formatRub, months } from './format';
import { navigate } from './routes';
import { checkStatusLabels, clientStateLabels, documentLabels, providerLabels, purposeLabels, riskLabels } from '../../api-server/credit/labels';
import type { ApplicationState, RiskLevel } from '../../api-server/credit/types';

const payloadLabels: Record<string, string> = {
  active: 'Действует', registrationDate: 'Дата регистрации', okved: 'ОКВЭД', activeDebt: 'Действующий долг', overdueAmount: 'Сумма просрочки',
  maxDaysOverdue: 'Макс. просрочка, дн.', hasHistory: 'Есть история', activeLoans: 'Действующих кредитов', latePayments12m: 'Просрочек за 12 мес.',
  revenue: 'Выручка', expenses: 'Расходы', profit: 'Прибыль', currentDebt: 'Текущий долг', period: 'Период', source: 'Источник',
};
const moneyKeys = new Set(['activeDebt', 'overdueAmount', 'revenue', 'expenses', 'profit', 'currentDebt']);
const payloadValue = (key: string, value: unknown) =>
  typeof value === 'boolean' ? (value ? 'да' : 'нет') : moneyKeys.has(key) && typeof value === 'number' ? formatRub(value) : String(value ?? '—');

function RiskBadge({ risk }: { risk: RiskLevel | null }) {
  return risk ? <span className={`op-risk op-risk-${risk.toLowerCase()}`}>{riskLabels[risk]}</span> : <span className="op-muted">—</span>;
}

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

export function BankWorkspace({ selectedId }: { selectedId?: string }) {
  const [rows, setRows] = useState<BankRow[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback((signal?: AbortSignal) => {
    setError('');
    creditApi.bankApplications(signal).then((data) => setRows(data.applications)).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
  }, []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  const open = (id: string) => navigate({ name: 'bank-application', id });
  return <div className="op-page op-bank">
    <header className="op-page-header">
      <div><h1>Банковская сторона</h1><p className="op-muted">Те же заявки изнутри: проверки, модель риска, скоринг, решение и история состояний.</p></div>
      <Button view="secondary" size={40} onClick={() => load()}>Обновить</Button>
    </header>
    <SyntheticBadge text="Демо-роль без авторизации; проверки, модель риска, скоринг и решения синтетические" />
    {error && <ErrorNote error={error} onRetry={() => load()} />}
    {!rows && !error && <Loading text="Загружаем заявки…" />}
    {rows && <Section title="Заявки" aside={<span className="op-muted">{rows.length}</span>}>
      {rows.length ? <>
        <div className="op-table-wrap op-desktop-only"><table className="op-table">
          <thead><tr><th>Заявка</th><th>Компания</th><th>Сумма</th><th>Продукт</th><th>Состояние</th><th>Скоринг</th><th>ML-риск</th><th>Решение</th><th>Обновлена</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} aria-selected={row.id === selectedId} onClick={() => open(row.id)}>
            <td><a href={`#/bank/applications/${row.id}`}>{row.number}</a></td>
            <td>{row.companyName}<br /><span className="op-muted">{row.companyInn} · {row.relationship === 'client' ? 'клиент' : 'не клиент'}</span></td>
            <td>{row.requestedAmount ? formatRub(row.requestedAmount) : '—'}</td>
            <td>{row.productName ?? '—'}</td>
            <td><StatusBadge state={row.state} internal /></td>
            <td>{row.score ?? '—'}</td>
            <td>{row.mlProbability !== null ? `${(row.mlProbability * 100).toFixed(1)}%` : '—'} <RiskBadge risk={row.mlRiskLevel} /></td>
            <td>{row.outcome ? <OutcomeBadge outcome={row.outcome} /> : '—'}</td>
            <td className="op-muted">{formatDateTime(row.updatedAt)}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="op-mobile-only op-list">{rows.map((row) => <button key={row.id} type="button" className="op-application-card" aria-current={row.id === selectedId} onClick={() => open(row.id)}>
          <span className="op-row"><strong>{row.number}</strong><StatusBadge state={row.state} internal /></span>
          <span>{row.companyName} · {row.requestedAmount ? formatRub(row.requestedAmount) : '—'}</span>
          <span className="op-muted">Скоринг {row.score ?? '—'} · ML-риск {row.mlProbability !== null ? `${(row.mlProbability * 100).toFixed(1)}%` : '—'}{row.outcome ? ` · ${row.outcome}` : ''}</span>
        </button>)}</div>
      </> : <p className="op-empty">Заявок пока нет. Переключитесь на роль «Клиент» и создайте заявку.</p>}
    </Section>}
    {selectedId && <BankApplication id={selectedId} />}
  </div>;
}

type TabId = 'overview' | 'checks' | 'risk' | 'decision' | 'history';
function BankApplication({ id }: { id: string }) {
  const [view, setView] = useState<BankView | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabId>('overview');
  useEffect(() => {
    const controller = new AbortController();
    creditApi.bankApplication(id, controller.signal).then(setView).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
    return () => controller.abort();
  }, [id]);
  if (error) return <ErrorNote error={error} />;
  if (!view) return <Loading text="Загружаем заявку…" />;
  const { application: app, company, scoring, decision, riskAssessment: risk } = view;
  return <Section title={`Заявка ${app.number}`} aside={<StatusBadge state={app.state} internal />} className="op-bank-detail">
    <Pipeline view={view} />
    <Tabs selectedId={tab} onChange={(_, { selectedId }) => setTab(selectedId as TabId)} scrollable size="s">
      <Tab id="overview" title="Обзор"><div className="op-tab">
        <div className="op-grid-2">
          <Facts items={[
            ['Состояние', `${app.state} — ${clientStateLabels[app.state].title}`], ['Продукт', view.product?.name ?? '—'],
            ['Цель', app.purpose ? purposeLabels[app.purpose] : '—'],
            ['Запрошено', app.requestedAmount ? `${formatRub(app.requestedAmount)} на ${months(app.requestedTermMonths ?? 0)}` : '—'],
            ['Попытка подачи', String(app.attempt)], ['Полнота анкеты', `${Math.round(view.readiness.completeness * 100)}%`],
            ['Описание цели', app.purposeDescription || '—'],
          ]} />
          <div>
            {company.isSynthetic && <SyntheticBadge />}
            <Facts items={[
              ['Клиент', company.relationship === 'client' ? 'клиент банка' : 'не клиент банка'], ['Компания', company.name], ['ИНН', company.inn],
              ['Регистрация', formatDate(company.registrationDate)], ['ОКВЭД', company.okved], ['Регион', company.region],
              ['Источник профиля', company.relationship === 'client' ? 'данные банка (синтетические)' : company.source],
              ['Заявленные показатели', app.declaredFinancials ? `выручка ${formatRub(app.declaredFinancials.revenue)}, расходы ${formatRub(app.declaredFinancials.expenses)}, долг ${formatRub(app.declaredFinancials.currentDebt)}${app.declaredFinancials.activeLoans !== undefined ? `, кредитов ${app.declaredFinancials.activeLoans}` : ''}` : 'не указаны'],
              ['Кредитная история (анкета)', app.declaredCreditHistory ? (app.declaredCreditHistory.hadOverdue12m ? `просрочки до ${app.declaredCreditHistory.maxOverdueDays} дн.` : 'без просрочек') : 'не указана'],
            ]} />
          </div>
        </div>
        <ProgressBar value={view.readiness.completeness} label="Полнота анкеты" />
        {view.documents.length > 0 && <ul className="op-plain">{view.documents.map((d) => <li key={d.id}>
          {documentLabels[d.type]} — {d.fileName} <span className="op-muted">({Math.round(d.sizeBytes / 1024)} КБ)</span></li>)}</ul>}
      </div></Tab>
      <Tab id="checks" title="Проверки (mock)"><div className="op-tab">
        {view.checks.length ? <div className="op-checks-grid">{view.checks.map((check) => <article key={check.id} className="op-check" data-status={check.status}>
          <header><strong>{providerLabels[check.provider].bank}</strong><span className="op-pill">{check.status} · {checkStatusLabels[check.status]}</span></header>
          {check.payload ? <dl className="op-facts op-facts-compact">{Object.entries(check.payload).map(([key, value]) =>
            <div key={key}><dt>{payloadLabels[key] ?? key}</dt><dd>{payloadValue(key, value)}</dd></div>)}</dl> : <p className="op-muted">Нет данных</p>}
          <small className="op-muted">{formatDateTime(check.checkedAt)}</small>
        </article>)}</div> : <p className="op-empty">Проверки ещё не выполнялись.</p>}
      </div></Tab>
      <Tab id="risk" title="Риск и скоринг"><div className="op-tab op-grid-2">
        <div>
          <h3>ML-модель риска</h3>
          {risk ? <>
            <p className="op-score"><strong>{(risk.probability * 100).toFixed(1)}%</strong> вероятность проблемного обслуживания (12 мес.) <RiskBadge risk={risk.riskLevel} /></p>
            <ul className="op-reasons">{risk.topFactors.map((f) => <li key={f.feature} className={f.impact === 'positive' ? 'op-reason-positive' : 'op-reason-warning'}>
              <span aria-hidden="true">{f.impact === 'positive' ? '↓' : '↑'}</span>{f.text} <small className="op-muted">({f.feature})</small></li>)}</ul>
            <p className="op-muted op-small">Модель {risk.modelVersion}, демо: обучена на синтетических данных. Входит в решение как один из факторов — не принимает его сама.</p>
          </> : <p className="op-empty">{view.riskModelVersion ? 'Модель не применялась: недостаточно финансовых данных.' : 'Модель риска не подключена.'}</p>}
        </div>
        <div>
          <h3>Детерминированный скоринг</h3>
          {scoring ? <>
            <p className="op-score"><strong>{scoring.score}</strong>/100 <RiskBadge risk={scoring.riskLevel} /></p>
            {!scoring.dataComplete && <p className="op-alert op-alert-warning">Часть факторов рассчитана без данных и получила 0 баллов.</p>}
            <ul className="op-factors">{scoring.factors.map((factor) => <li key={factor.code} data-effect={factor.effect}>
              <div><strong>{factor.title}</strong><span>{factor.impact} / {factor.maxImpact}</span></div>
              <span className="op-factor-bar"><span style={{ width: `${(factor.impact / factor.maxImpact) * 100}%` }} /></span>
              <small className="op-muted">{factor.code} · {factor.explanation}</small>
            </li>)}</ul>
          </> : <p className="op-empty">Оценка ещё не рассчитана.</p>}
        </div>
      </div></Tab>
      <Tab id="decision" title="Решение"><div className="op-tab">
        {decision ? <>
          <p className="op-row"><OutcomeBadge outcome={decision.outcome} /> {decision.summary}</p>
          {decision.offer && <Facts items={[['Продукт', view.offerProduct?.name ?? decision.offer.productId], ['Сумма', formatRub(decision.offer.amount)],
            ['Срок', months(decision.offer.termMonths)], ['Ставка', `${decision.offer.rate}%${decision.offer.pricing ? ` = ${decision.offer.pricing.keyRate} + ${decision.offer.pricing.productMargin} + ${decision.offer.pricing.riskPremium}` : ''}`],
            ['Платёж', formatRub(decision.offer.monthlyPayment)]]} />}
          <h3>Причины</h3>
          <ReasonList reasons={decision.reasons} />
          {decision.requiredInfo.length > 0 && <><h3>Запрошено у клиента</h3><ul className="op-plain">{decision.requiredInfo.map((i) => <li key={i.code}>{i.text}</li>)}</ul></>}
          <p className="op-muted op-small">Решение = правила CreditDecisionEngine (стоп-факторы, пороги скоринга, платёжеспособность, продуктовые ограничения) с учётом ML-риска.</p>
        </> : <p className="op-empty">Решение ещё не сформировано.</p>}
        {view.financing && <Facts items={[['Финансирование', `${view.financing.status} (симуляция)`], ['Остаток', formatRub(view.financing.remainingPrincipal)],
          ['Оплачено платежей', `${view.financing.paidInstallments} из ${view.financing.termMonths}`]]} />}
      </div></Tab>
      <Tab id="history" title="История"><div className="op-tab">
        <ol className="op-events">{view.events.map((event) => <li key={event.id}>
          <span className="op-muted">#{event.sequence} · {formatDateTime(event.createdAt)} · {event.type}</span>
          <strong>{event.fromState || event.toState ? `${event.fromState ?? '∅'} → ${event.toState ?? '∅'}` : event.message}</strong>
          {(event.fromState || event.toState) && <span>{event.message}</span>}
          {event.payload && <code>{JSON.stringify(event.payload)}</code>}
        </li>)}</ol>
      </div></Tab>
    </Tabs>
  </Section>;
}
