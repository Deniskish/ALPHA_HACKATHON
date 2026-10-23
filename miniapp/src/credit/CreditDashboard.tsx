import { useCallback, useEffect, useState } from 'react';
import { Button } from '@alfalab/core-components-button';
import { creditApi, type ApplicationSummary } from './api';
import { ErrorNote, Facts, Loading, Section, StatusBadge, SyntheticBadge } from './ui';
import { errorMessage, formatDate, formatRub, months } from './format';
import { navigate } from './routes';
import type { DemoSession } from './session';
import type { ApplicationState } from '../../api-server/credit/types';

const finished: ApplicationState[] = ['REJECTED', 'ACTIVE_FINANCING'];
const resultStates: ApplicationState[] = ['APPROVED', 'COUNTER_OFFER', 'NEEDS_INFO', 'REJECTED', 'OFFER_ACCEPTED', 'COMPLETED'];

export function ApplicationCard({ app }: { app: ApplicationSummary }) {
  return <button type="button" className="op-application-card" onClick={() => navigate({ name: 'application', id: app.id })}>
    <span className="op-row"><span className="op-muted">{app.number}</span><StatusBadge state={app.state} /></span>
    <strong>{app.requestedAmount ? formatRub(app.requestedAmount) : 'Сумма не указана'}
      {app.requestedTermMonths ? <span className="op-muted"> · {months(app.requestedTermMonths)}</span> : null}</strong>
    <span>{app.productName ?? 'Продукт ещё не выбран'}</span>
    <span className="op-next"><span className="op-muted">Следующий шаг:</span> {app.status.next}</span>
  </button>;
}

export function CreditDashboard({ session }: { session: DemoSession }) {
  const company = session.company;
  const [apps, setApps] = useState<ApplicationSummary[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback((signal?: AbortSignal) => {
    setError('');
    creditApi.applications(signal, company.inn).then((data) => setApps(data.applications)).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
  }, [company.inn]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);

  const active = apps?.filter((app) => !finished.includes(app.state)) ?? [];
  const financed = apps?.filter((app) => app.state === 'ACTIVE_FINANCING') ?? [];
  const results = apps?.filter((app) => resultStates.includes(app.state) || app.state === 'REJECTED')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5) ?? [];
  const bank = company.bankProfile;
  return <div className="op-page">
    <section className="op-hero op-hero-compact">
      <div>
        <span className="op-eyebrow">{session.relationship === 'client' ? 'Клиент банка · демо' : 'Пока не клиент банка · демо'}</span>
        <h1>{company.name}</h1>
        <p>Опишите, на что нужны деньги, — подберём финансирование и покажем решение с понятными причинами.</p>
        <Button view="accent" size={56} onClick={() => navigate({ name: 'new' })}>Получить финансирование</Button>
      </div>
      <div className="op-hero-facts">
        {company.isSynthetic && <SyntheticBadge />}
        <Facts items={[['ИНН', company.inn], ['Регион', company.region], ['ОКВЭД', company.okvedTitle ?? company.okved],
          ...(bank ? [['Клиент с', formatDate(bank.clientSince)], ['Обороты по счёту', `≈ ${formatRub(bank.monthlyTurnover)} в месяц`],
            ['Продукты банка', bank.products.join(', ')], ['Счёт', bank.accountMasked]] as [string, string][] : [])]} />
      </div>
    </section>
    {error && <ErrorNote error={error} onRetry={() => load()} />}
    {!apps && !error && <Loading text="Загружаем заявки…" />}
    {apps && <div className="op-grid-2">
      <Section title="Активные заявки" aside={<span className="op-muted">{active.length}</span>}>
        {active.length ? <div className="op-list">{active.map((app) => <ApplicationCard key={app.id} app={app} />)}</div>
          : <p className="op-empty">Активных заявок нет. Нажмите «Получить финансирование», чтобы начать.</p>}
      </Section>
      <div className="op-stack">
        {financed.length > 0 && <Section title="Действующее финансирование">
          <div className="op-list">{financed.map((app) => <ApplicationCard key={app.id} app={app} />)}</div>
        </Section>}
        <Section title="Последние результаты">
          {results.length ? <ul className="op-results">{results.map((app) => <li key={app.id}>
            <button type="button" onClick={() => navigate({ name: 'application', id: app.id })}>
              <span><strong>{app.requestedAmount ? formatRub(app.requestedAmount) : app.number}</strong><span className="op-muted">{app.number} · {formatDate(app.updatedAt)}</span></span>
              <StatusBadge state={app.state} />
            </button>
          </li>)}</ul> : <p className="op-empty">Здесь появятся решения по заявкам.</p>}
        </Section>
      </div>
    </div>}
  </div>;
}
