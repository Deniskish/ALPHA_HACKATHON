// Bank side (demo role): internal process view of every application.
import { useCallback, useEffect, useState } from 'react';
import { creditApi, type BankRow, type BankView } from './api';
import { ErrorNote, Facts, Loading, OutcomeBadge, ReasonList, Section, StatusBadge, SyntheticBadge } from './ui';
import { errorMessage, formatDate, formatDateTime, formatRub, months } from './format';
import { navigate } from './routes';
import { ActionButton } from '../shared/Controls';
import { checkStatusLabels, clientStateLabels, documentLabels, providerLabels, purposeLabels, riskLabels } from '../../api-server/credit/labels';
import type { RiskLevel } from '../../api-server/credit/types';

const payloadLabels: Record<string, string> = {
  active: 'Действует', registrationDate: 'Дата регистрации', okved: 'ОКВЭД', activeDebt: 'Действующий долг', overdueAmount: 'Сумма просрочки',
  maxDaysOverdue: 'Макс. просрочка, дн.', hasHistory: 'Есть история', revenue: 'Выручка', expenses: 'Расходы', profit: 'Прибыль',
  currentDebt: 'Текущий долг', period: 'Период', source: 'Источник',
};
const moneyKeys = new Set(['activeDebt', 'overdueAmount', 'revenue', 'expenses', 'profit', 'currentDebt']);
const payloadValue = (key: string, value: unknown) =>
  typeof value === 'boolean' ? (value ? 'да' : 'нет') : moneyKeys.has(key) && typeof value === 'number' ? formatRub(value) : String(value ?? '—');

function RiskBadge({ risk }: { risk: RiskLevel | null }) {
  return risk ? <span className={`cc-badge cc-risk-${risk.toLowerCase()}`}>{riskLabels[risk]}</span> : <span className="cc-muted">—</span>;
}

export function BankWorkspace({ selectedId }: { selectedId?: string }) {
  const [rows, setRows] = useState<BankRow[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback((signal?: AbortSignal) => {
    setError('');
    creditApi.bankApplications(signal).then((data) => setRows(data.applications)).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
  }, []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  return <div className="cc-page cc-bank">
    <header className="cc-page-header">
      <div><h1>Банковская сторона</h1><p className="cc-muted">Внутренний процесс обработки заявок: проверки, оценка, решение и история состояний.</p></div>
      <ActionButton className="secondary" onClick={() => load()}>Обновить</ActionButton>
    </header>
    <SyntheticBadge text="Демо-роль без авторизации; проверки, оценка и решения синтетические" />
    {error && <ErrorNote error={error} onRetry={() => load()} />}
    {!rows && !error && <Loading text="Загружаем заявки…" />}
    {rows && <Section title="Заявки" aside={<span className="cc-muted">{rows.length}</span>}>
      {rows.length ? <div className="cc-table-wrap"><table className="cc-table">
        <thead><tr><th>Заявка</th><th>Компания</th><th>Сумма</th><th>Продукт</th><th>Состояние</th><th>Оценка</th><th>Риск</th><th>Решение</th><th>Обновлена</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} aria-selected={row.id === selectedId} onClick={() => navigate({ name: 'bank-application', id: row.id })}>
          <td><a href={`#/bank/applications/${row.id}`}>{row.number}</a></td>
          <td>{row.companyName}<br /><span className="cc-muted">{row.companyInn}{row.isSynthetic ? ' · синт.' : ''}</span></td>
          <td>{row.requestedAmount ? formatRub(row.requestedAmount) : '—'}</td>
          <td>{row.productName ?? '—'}</td>
          <td><StatusBadge state={row.state} internal /></td>
          <td>{row.score ?? '—'}</td>
          <td><RiskBadge risk={row.riskLevel} /></td>
          <td>{row.outcome ? <OutcomeBadge outcome={row.outcome} /> : '—'}</td>
          <td className="cc-muted">{formatDateTime(row.updatedAt)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="cc-empty">Заявок пока нет. Переключитесь на роль «Клиент» и создайте заявку.</p>}
    </Section>}
    {selectedId && <BankApplication id={selectedId} />}
  </div>;
}

function BankApplication({ id }: { id: string }) {
  const [view, setView] = useState<BankView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    creditApi.bankApplication(id, controller.signal).then(setView).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
    return () => controller.abort();
  }, [id]);
  if (error) return <ErrorNote error={error} />;
  if (!view) return <Loading text="Загружаем заявку…" />;
  const { application: app, company, scoring, decision } = view;
  return <div className="cc-bank-detail" aria-label={`Заявка ${app.number}`}>
    <div className="cc-grid-2">
      <Section title={`Заявка ${app.number}`} aside={<StatusBadge state={app.state} internal />}>
        <Facts items={[
          ['Состояние', `${app.state} — ${clientStateLabels[app.state].title}`],
          ['Продукт', view.product?.name ?? '—'],
          ['Цель', app.purpose ? purposeLabels[app.purpose] : '—'],
          ['Запрошено', app.requestedAmount ? `${formatRub(app.requestedAmount)} на ${months(app.requestedTermMonths ?? 0)}` : '—'],
          ['Попытка подачи', String(app.attempt)],
          ['Создана / отправлена', `${formatDateTime(app.createdAt)} / ${app.submittedAt ? formatDateTime(app.submittedAt) : '—'}`],
          ['Описание цели', app.purposeDescription || '—'],
        ]} />
      </Section>
      <Section title="Компания" aside={company.isSynthetic && <SyntheticBadge />}>
        <Facts items={[
          ['Название', company.name], ['ИНН', company.inn], ['Регистрация', formatDate(company.registrationDate)],
          ['ОКВЭД', company.okved], ['Регион', company.region], ['Источник профиля', company.source],
          ['Заявленные показатели', app.declaredFinancials ? `выручка ${formatRub(app.declaredFinancials.revenue)}, расходы ${formatRub(app.declaredFinancials.expenses)}, долг ${formatRub(app.declaredFinancials.currentDebt)}` : 'не указаны'],
        ]} />
      </Section>
    </div>
    <Section title="Внешние проверки (mock)">
      {view.checks.length ? <div className="cc-checks-grid">{view.checks.map((check) => <article key={check.id} className="cc-check" data-status={check.status}>
        <header><strong>{providerLabels[check.provider].bank}</strong><span className="cc-badge">{check.status} · {checkStatusLabels[check.status]}</span></header>
        {check.payload ? <dl className="cc-facts cc-facts-compact">{Object.entries(check.payload).map(([key, value]) =>
          <div key={key}><dt>{payloadLabels[key] ?? key}</dt><dd>{payloadValue(key, value)}</dd></div>)}</dl> : <p className="cc-muted">Нет данных</p>}
        <small className="cc-muted">{formatDateTime(check.checkedAt)}</small>
      </article>)}</div> : <p className="cc-empty">Проверки ещё не выполнялись.</p>}
    </Section>
    <div className="cc-grid-2">
      <Section title="Скоринг" aside={scoring && <span className="cc-score"><strong>{scoring.score}</strong>/100 <RiskBadge risk={scoring.riskLevel} /></span>}>
        {scoring ? <>
          {!scoring.dataComplete && <p className="cc-alert cc-alert-warning">Часть факторов рассчитана без данных и получила 0 баллов.</p>}
          <ul className="cc-factors">{scoring.factors.map((factor) => <li key={factor.code} data-effect={factor.effect}>
            <div><strong>{factor.title}</strong><span>{factor.impact} / {factor.maxImpact}</span></div>
            <span className="cc-factor-bar"><span style={{ width: `${(factor.impact / factor.maxImpact) * 100}%` }} /></span>
            <small className="cc-muted">{factor.code} · {factor.explanation}</small>
          </li>)}</ul>
          <p className="cc-muted">Скоринг — одна из входных величин решения, а не само решение.</p>
        </> : <p className="cc-empty">Оценка ещё не рассчитана.</p>}
      </Section>
      <Section title="Кредитное решение" aside={decision && <OutcomeBadge outcome={decision.outcome} />}>
        {decision ? <>
          <p>{decision.summary}</p>
          {decision.offer && <Facts items={[['Продукт', view.offerProduct?.name ?? decision.offer.productId], ['Сумма', formatRub(decision.offer.amount)],
            ['Срок', months(decision.offer.termMonths)], ['Ставка', `${decision.offer.rate}%`], ['Платёж', formatRub(decision.offer.monthlyPayment)]]} />}
          <h3>Причины</h3>
          <ReasonList reasons={decision.reasons} />
          {decision.requiredInfo.length > 0 && <><h3>Запрошено у клиента</h3><ul>{decision.requiredInfo.map((i) => <li key={i.code}>{i.text}</li>)}</ul></>}
        </> : <p className="cc-empty">Решение ещё не сформировано.</p>}
      </Section>
    </div>
    <Section title="Документы">
      {view.documents.length ? <ul className="cc-plain-list">{view.documents.map((d) => <li key={d.id}>
        {documentLabels[d.type]} — {d.fileName} <span className="cc-muted">({Math.round(d.sizeBytes / 1024)} КБ{d.textCharacters ? `, ${d.textCharacters} символов текста` : ''})</span>
      </li>)}</ul> : <p className="cc-empty">Документов нет.</p>}
    </Section>
    <Section title="История событий">
      <div className="cc-table-wrap"><table className="cc-table cc-events">
        <thead><tr><th>#</th><th>Время</th><th>Событие</th><th>Переход</th><th>Описание</th></tr></thead>
        <tbody>{view.events.map((event) => <tr key={event.id}>
          <td>{event.sequence}</td><td className="cc-muted">{formatDateTime(event.createdAt)}</td><td>{event.type}</td>
          <td>{event.fromState || event.toState ? `${event.fromState ?? '∅'} → ${event.toState ?? '∅'}` : '—'}</td>
          <td>{event.message}{event.payload ? <span className="cc-muted"> {JSON.stringify(event.payload)}</span> : null}</td>
        </tr>)}</tbody>
      </table></div>
    </Section>
  </div>;
}
