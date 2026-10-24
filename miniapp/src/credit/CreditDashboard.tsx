import { useCallback, useEffect, useState } from 'react';
import { Button } from '@alfalab/core-components-button';
import { ArrowRightMIcon } from '@alfalab/icons-glyph/ArrowRightMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { CashMoneyMIcon } from '@alfalab/icons-glyph/CashMoneyMIcon';
import { ClockMIcon } from '@alfalab/icons-glyph/ClockMIcon';
import { creditApi, type ApplicationSummary } from './api';
import { ErrorNote, Facts, HeroMark, Loading, Logo, Money, Section, StatusBadge, SyntheticBadge } from './ui';
import { errorMessage, formatDate, months } from './format';
import { navigate } from './routes';
import type { DemoSession } from './session';
import type { ApplicationState } from '../../api-server/credit/types';

const finished: ApplicationState[] = ['REJECTED', 'ACTIVE_FINANCING'];
const resultStates: ApplicationState[] = ['APPROVED', 'COUNTER_OFFER', 'NEEDS_INFO', 'REJECTED', 'OFFER_ACCEPTED', 'COMPLETED'];

export function ApplicationCard({ app }: { app: ApplicationSummary }) {
  return <button type="button" className="op-application-card" onClick={() => navigate({ name: 'application', id: app.id })}>
    <span className="op-row"><span className="op-muted op-small">{app.number}</span><StatusBadge state={app.state} /></span>
    <strong className="op-application-amount">{app.requestedAmount ? <Money value={app.requestedAmount} /> : 'Сумма не указана'}
      {app.requestedTermMonths ? <span className="op-muted"> · {months(app.requestedTermMonths)}</span> : null}</strong>
    <span>{app.productName ?? 'Продукт ещё не выбран'}</span>
    <span className="op-next"><ArrowRightMIcon aria-hidden="true" />{app.status.next}</span>
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
  return <div className="op-page op-dashboard">
    <section className="op-hero op-hero-company">
      <div className="op-hero-copy">
        <span className="op-eyebrow">{session.relationship === 'client' ? 'Клиент банка · демо' : 'Пока не клиент банка · демо'}</span>
        <h1>Чем помочь бизнесу?</h1>
        <p>Опишите задачу своими словами — подберём финансирование, покажем ставку и платёж до подачи заявки и объясним решение.</p>
        <div className="op-hero-actions">
          <Button view="accent" size={56} onClick={() => navigate({ name: 'new' })} rightAddons={<ArrowRightMIcon />}>Получить финансирование</Button>
          <span className="op-hero-hint">5 шагов · решение за минуты</span>
        </div>
      </div>
      <article className="op-business-card" aria-label={`Профиль компании ${company.name}`}>
        <HeroMark className="op-business-card-mark" />
        <header><Logo variant="silver" height={18} /><span>{bank ? 'Бизнес-счёт' : 'Профиль компании'}</span></header>
        <strong className="op-business-card-name">{company.name}</strong>
        <span className="op-business-card-inn">ИНН {company.inn}</span>
        {bank ? <div className="op-business-card-turnover"><small>Обороты по счёту в месяц</small><Money value={bank.monthlyTurnover} bold /></div>
          : <div className="op-business-card-turnover"><small>Данные о компании</small><span>из реестра — подтверждены вами</span></div>}
        <footer><span>{bank ? bank.accountMasked : company.region}</span><span>{bank ? `клиент с ${formatDate(bank.clientSince)}` : 'не клиент банка'}</span></footer>
      </article>
    </section>
    <Section title="Профиль бизнеса" aside={company.isSynthetic ? <SyntheticBadge /> : undefined}>
      <Facts items={[['Регион', company.region], ['Деятельность', company.okvedTitle ?? company.okved], ['Регистрация', formatDate(company.registrationDate)],
        ...(company.employees !== null ? [['Сотрудников', String(company.employees)]] as [string, string][] : []),
        ...(bank ? [['Продукты банка', bank.products.join(', ')]] as [string, string][] : [])]} />
    </Section>
    {error && <ErrorNote error={error} onRetry={() => load()} />}
    {!apps && !error && <Loading text="Загружаем заявки…" />}
    {apps && <div className="op-grid-2">
      <Section title="Активные заявки" icon={DocumentLinesMIcon} aside={<span className="op-count">{active.length}</span>}>
        {active.length ? <div className="op-list">{active.map((app) => <ApplicationCard key={app.id} app={app} />)}</div>
          : <p className="op-empty">Активных заявок нет. Нажмите «Получить финансирование», чтобы начать.</p>}
      </Section>
      <div className="op-stack">
        {financed.length > 0 && <Section title="Действующее финансирование" icon={CashMoneyMIcon}>
          <div className="op-list">{financed.map((app) => <ApplicationCard key={app.id} app={app} />)}</div>
        </Section>}
        <Section title="Последние результаты" icon={ClockMIcon}>
          {results.length ? <ul className="op-results">{results.map((app) => <li key={app.id}>
            <button type="button" onClick={() => navigate({ name: 'application', id: app.id })}>
              <span><strong>{app.requestedAmount ? <Money value={app.requestedAmount} /> : app.number}</strong>
                <span className="op-muted op-small">{app.number} · {formatDate(app.updatedAt)}</span></span>
              <StatusBadge state={app.state} />
            </button>
          </li>)}</ul> : <p className="op-empty">Здесь появятся решения по заявкам.</p>}
        </Section>
      </div>
    </div>}
  </div>;
}
