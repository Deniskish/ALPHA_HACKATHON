import { useCallback, useEffect, useState } from 'react';
import { creditApi, type ApplicationSummary } from './api';
import { ErrorNote, Loading, Section, StatusBadge, SyntheticBadge } from './ui';
import { errorMessage, formatDate, formatRub, months } from './format';
import { navigate } from './routes';
import { ActionButton } from '../shared/Controls';
import type { ApplicationState } from '../../api-server/credit/types';

const finished: ApplicationState[] = ['REJECTED', 'COMPLETED'];
const resultStates: ApplicationState[] = ['APPROVED', 'COUNTER_OFFER', 'NEEDS_INFO', 'REJECTED', 'OFFER_ACCEPTED', 'COMPLETED'];

export function ApplicationCard({ app }: { app: ApplicationSummary }) {
  return <button type="button" className="cc-application-card" onClick={() => navigate({ name: 'application', id: app.id })}>
    <span className="cc-application-card-top"><span className="cc-muted">{app.number}</span><StatusBadge state={app.state} /></span>
    <strong>{app.requestedAmount ? formatRub(app.requestedAmount) : 'Сумма не указана'}
      {app.requestedTermMonths ? <span className="cc-muted"> · {months(app.requestedTermMonths)}</span> : null}</strong>
    <span>{app.companyName}{app.productName ? ` · ${app.productName}` : ''}</span>
    <span className="cc-next"><span className="cc-muted">Следующий шаг:</span> {app.status.next}</span>
  </button>;
}

export function CreditDashboard() {
  const [apps, setApps] = useState<ApplicationSummary[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback((signal?: AbortSignal) => {
    setError('');
    creditApi.applications(signal).then((data) => setApps(data.applications)).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
  }, []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);

  const active = apps?.filter((app) => !finished.includes(app.state)) ?? [];
  const results = apps?.filter((app) => resultStates.includes(app.state))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5) ?? [];
  return <div className="cc-page cc-dashboard">
    <section className="cc-hero">
      <div>
        <h1>Финансирование для вашего бизнеса</h1>
        <p>Опишите потребность — подберём кредитный продукт, проверим заявку и покажем решение с понятными причинами. Всё в одном процессе.</p>
        <ActionButton className="primary cc-cta" onClick={() => navigate({ name: 'new' })}>Получить финансирование</ActionButton>
      </div>
      <ol className="cc-hero-steps" aria-label="Как это работает">
        <li><strong>1</strong>Компания и потребность</li>
        <li><strong>2</strong>Подходящий продукт</li>
        <li><strong>3</strong>Заявка и документы</li>
        <li><strong>4</strong>Решение за секунды</li>
      </ol>
    </section>
    <SyntheticBadge text="Демо-режим: компании, продукты и решения — синтетические демонстрационные данные" />
    {error && <ErrorNote error={error} onRetry={() => load()} />}
    {!apps && !error && <Loading text="Загружаем заявки…" />}
    {apps && <div className="cc-grid-2">
      <Section title="Активные заявки" aside={<span className="cc-muted">{active.length}</span>}>
        {active.length ? <div className="cc-list">{active.map((app) => <ApplicationCard key={app.id} app={app} />)}</div>
          : <p className="cc-empty">Активных заявок нет. Нажмите «Получить финансирование», чтобы начать.</p>}
      </Section>
      <Section title="Последние результаты">
        {results.length ? <ul className="cc-results">{results.map((app) => <li key={app.id}>
          <button type="button" onClick={() => navigate({ name: 'application', id: app.id })}>
            <span><strong>{app.companyName}</strong><span className="cc-muted">{app.number} · {formatDate(app.updatedAt)}</span></span>
            <StatusBadge state={app.state} />
          </button>
        </li>)}</ul> : <p className="cc-empty">Здесь появятся решения по вашим заявкам.</p>}
      </Section>
    </div>}
  </div>;
}
