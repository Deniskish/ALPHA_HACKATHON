// Step 5 «Решение»: what happened, why, what to do next — then simulated signing, issue and support after the decision.
import { useState } from 'react';
import { Button } from '@alfalab/core-components-button';
import { ArrowRightMIcon } from '@alfalab/icons-glyph/ArrowRightMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { ChartLineAscMIcon } from '@alfalab/icons-glyph/ChartLineAscMIcon';
import { CashMoneyMIcon } from '@alfalab/icons-glyph/CashMoneyMIcon';
import { ArrowsRightLeftCurvedMIcon } from '@alfalab/icons-glyph/ArrowsRightLeftCurvedMIcon';
import { ChartPieCoinsMIcon } from '@alfalab/icons-glyph/ChartPieCoinsMIcon';
import { ClockMIcon } from '@alfalab/icons-glyph/ClockMIcon';
import { BulbMIcon } from '@alfalab/icons-glyph/BulbMIcon';
import { creditApi, type ApplicationView } from './api';
import { ErrorNote, Facts, HeroMark, IconTile, Logo, Money, OutcomeBadge, ProgressBar, Rate, ReasonList, Reveal, Section, type GlyphIcon } from './ui';
import { errorMessage, formatDate, formatDateTime, months } from './format';
import { navigate } from './routes';
import { Improvements } from './Improvements';
import { Explanation } from './Explanation';
import { CashFlowSimulator } from './CashFlowSimulator';
import type { OfferTerms } from '../../api-server/credit/types';

function Offer({ offer, productName, requested }: { offer: OfferTerms; productName: string; requested?: { amount: number; term: number } }) {
  return <div className="op-offer">
    <div className="op-offer-amount">
      <span className="op-offer-label">Сумма</span>
      <strong><Money value={offer.amount} /></strong>
      {requested && requested.amount !== offer.amount && <span className="op-offer-requested">запрошено <s className="op-muted"><Money value={requested.amount} /></s></span>}
    </div>
    <div><span className="op-offer-label">Срок</span><strong>{months(offer.termMonths)}</strong>
      {requested && requested.term !== offer.termMonths && <span className="op-offer-requested">запрошено <s className="op-muted">{months(requested.term)}</s></span>}</div>
    <div className="op-offer-rate"><span className="op-offer-label">Ставка</span><Rate rate={offer.rate} pricing={offer.pricing} /></div>
    <div><span className="op-offer-label">Платёж в месяц</span><strong><Money value={offer.monthlyPayment} /></strong></div>
    <div className="op-offer-product"><span className="op-offer-label">Продукт</span><strong>{productName}</strong></div>
  </div>;
}

export function ApplicationResult({ view, onChange }: { view: ApplicationView; onChange: (view: ApplicationView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const app = view.application, decision = view.decision, state = app.state;
  const act = async (action: () => Promise<ApplicationView>) => {
    setBusy(true); setError('');
    try { onChange(await action()); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  if (state === 'ACTIVE_FINANCING' && view.financing) return <FinancingPanel view={view} busy={busy} error={error}
    onPay={() => void act(() => creditApi.pay(app.id, view.financing!.paidInstallments + 1))} />;
  const offer = app.acceptedOffer ?? decision?.offer ?? null;
  const productName = view.offerProduct?.name ?? view.product?.name ?? '';
  const requested = app.requestedAmount && app.requestedTermMonths ? { amount: app.requestedAmount, term: app.requestedTermMonths } : undefined;
  const headline = state === 'COMPLETED' ? 'Договор подписан' : state === 'OFFER_ACCEPTED' ? 'Предложение принято'
    : decision?.outcome === 'APPROVED' ? 'Заявка одобрена' : decision?.outcome === 'COUNTER_OFFER' ? 'У нас есть встречное предложение'
      : decision?.outcome === 'REJECTED' ? 'Заявка не одобрена' : 'Решение по заявке';
  const improvable = decision && (decision.outcome === 'COUNTER_OFFER' || decision.outcome === 'REJECTED' || decision.reasons.some((r) => r.code === 'MEDIUM_RISK'))
    && ['APPROVED', 'COUNTER_OFFER', 'REJECTED'].includes(state);
  const premium = !!offer;
  const summary = state === 'COMPLETED' ? 'Договор подписан в демонстрационном режиме — электронная подпись не создавалась.'
    : state === 'OFFER_ACCEPTED' ? 'Вы приняли предложение. Осталось подписать договор.' : decision?.summary;
  const next = state === 'COMPLETED' ? 'Получите финансирование — выдача в демо моделируется, деньги не перечисляются.'
    : state === 'OFFER_ACCEPTED' ? 'Подпишите договор. В демо подписание моделируется.' : decision?.nextAction;
  return <div className="op-result" data-outcome={decision?.outcome}>
    <div className="op-stack op-result-main">
      <section className={`op-verdict${premium ? ' op-verdict-premium' : ''}`} aria-labelledby="verdict-title">
        {premium && <HeroMark className="op-verdict-mark" />}
        <header className="op-verdict-head">
          {decision && <OutcomeBadge outcome={decision.outcome} />}
          {premium && <Logo variant="silver" height={16} />}
        </header>
        <h2 id="verdict-title">{headline}</h2>
        <span className="op-verdict-label">Что произошло</span>
        <p className="op-result-summary">{summary}</p>
        {offer && <Offer offer={offer} productName={productName} requested={decision?.outcome === 'COUNTER_OFFER' ? requested : undefined} />}
        {error && <ErrorNote error={error} />}
        <div className="op-actions">
          {(state === 'APPROVED' || state === 'COUNTER_OFFER') &&
            <Button view="accent" size={56} loading={busy} rightAddons={<ArrowRightMIcon />} onClick={() => void act(() => creditApi.accept(app.id))}>
              {state === 'COUNTER_OFFER' ? 'Принять встречное предложение' : 'Принять предложение'}</Button>}
          {state === 'OFFER_ACCEPTED' && <Button view="accent" size={56} loading={busy} onClick={() => void act(() => creditApi.sign(app.id))}>Подписать договор (симуляция)</Button>}
          {state === 'COMPLETED' && <Button view="accent" size={56} loading={busy} onClick={() => void act(() => creditApi.issue(app.id))}>Получить финансирование (симуляция)</Button>}
          {(state === 'COUNTER_OFFER' || state === 'REJECTED') &&
            <Button view="secondary" colors={premium ? 'inverted' : 'default'} size={56} onClick={() => navigate({ name: 'new' })}>Новая заявка</Button>}
          <Button view="secondary" colors={premium ? 'inverted' : 'default'} size={56} onClick={() => navigate({ name: 'dashboard' })}>В кабинет</Button>
        </div>
      </section>
      {decision && decision.reasons.length > 0 && <Section title="Почему" icon={BulbMIcon} description="Причины решения — из проверок, скоринга, модели риска и правил банка">
        <ReasonList reasons={decision.reasons} />
      </Section>}
      {next && <section className="op-next-step">
        <IconTile icon={ArrowRightMIcon} tone="accent" size={48} />
        <div><h3>Что дальше</h3><p>{next}</p></div>
      </section>}
      {decision && decision.outcome !== 'NEEDS_INFO' && <Explanation applicationId={app.id} attempt={app.attempt} kind="decision" />}
      {offer && (view.company?.financials || app.declaredFinancials) && (
        <CashFlowSimulator
          annualRevenue={(view.company?.financials ?? app.declaredFinancials)!.revenue}
          annualExpenses={(view.company?.financials ?? app.declaredFinancials)!.expenses || (view.company?.financials ?? app.declaredFinancials)!.revenue * 0.8}
          loanAmount={offer.amount}
          loanRate={offer.rate}
          loanTermMonths={offer.termMonths}
          existingDebt={(view.company?.financials ?? app.declaredFinancials)!.currentDebt || 0}
        />
      )}
      {improvable && <Improvements applicationId={app.id} attempt={app.attempt} />}
    </div>
    <History view={view} />
  </div>;
}

function History({ view }: { view: ApplicationView }) {
  return <Section title="История заявки" icon={ClockMIcon} className="op-history">
    <Reveal summary={`${view.timeline.length} событий · показать`}>
      <ol className="op-history-list">{view.timeline.map((event) => <li key={event.sequence}>
        <span className="op-muted">{formatDateTime(event.createdAt)}</span>{event.message}
      </li>)}</ol>
    </Reveal>
  </Section>;
}

const opportunityIcons: Record<string, GlyphIcon> = { LIMIT_INCREASE: ChartLineAscMIcon, ADDITIONAL_WORKING_CAPITAL: CashMoneyMIcon,
  REFINANCING: ArrowsRightLeftCurvedMIcon, INVESTMENT: ChartPieCoinsMIcon };

function FinancingPanel({ view, busy, error, onPay }: { view: ApplicationView; busy: boolean; error: string; onPay: () => void }) {
  const financing = view.financing!;
  const progress = financing.paidInstallments / financing.termMonths;
  return <div className="op-result" data-outcome="ACTIVE_FINANCING">
    <div className="op-stack op-result-main">
      <section className="op-verdict op-verdict-premium op-loan" aria-labelledby="loan-title">
        <HeroMark className="op-verdict-mark" />
        <header className="op-verdict-head"><span className="op-pill op-pill-inverted">Симуляция</span><Logo variant="silver" height={16} /></header>
        <h2 id="loan-title">Финансирование выдано</h2>
        <p className="op-result-summary">{financing.summary}</p>
        <div className="op-loan-balance"><span className="op-offer-label">Остаток долга</span><strong><Money value={financing.remainingPrincipal} /></strong>
          <span className="op-offer-label">из <Money value={financing.amount} /> · {financing.productName}</span></div>
        <div className="op-loan-progress"><ProgressBar value={progress} label={`Оплачено ${financing.paidInstallments} из ${financing.termMonths} платежей`} /></div>
        <div className="op-offer">
          <div><span className="op-offer-label">Следующий платёж</span><strong>{financing.nextPayment ? <Money value={financing.nextPayment.amount} /> : '—'}</strong>
            {financing.nextPayment && <span className="op-offer-requested">{formatDate(financing.nextPayment.date)}</span>}</div>
          <div><span className="op-offer-label">Срок</span><strong>{months(financing.termMonths)}</strong></div>
          <div className="op-offer-rate"><span className="op-offer-label">Ставка</span><Rate rate={financing.rate} /></div>
          <div><span className="op-offer-label">Статус</span><strong>{financing.status === 'REPAID' ? 'Погашен' : 'Действует'}</strong></div>
        </div>
        <p className="op-loan-paid">Оплачено {financing.paidInstallments} из {financing.termMonths} платежей · продукт «{financing.productName}»</p>
        {error && <ErrorNote error={error} />}
        <div className="op-actions">
          {financing.status === 'ACTIVE' && <Button view="accent" size={56} loading={busy} onClick={onPay}>Смоделировать очередной платёж</Button>}
          <Button view="secondary" colors="inverted" size={56} onClick={() => navigate({ name: 'dashboard' })}>В кабинет</Button>
        </div>
        <p className="op-verdict-note">Платежи и проводки не выполняются: график рассчитывается из условий договора для демонстрации сопровождения.</p>
      </section>
      {view.company?.financials && (
        <CashFlowSimulator
          annualRevenue={view.company.financials.revenue}
          annualExpenses={view.company.financials.expenses || view.company.financials.revenue * 0.8}
          loanAmount={financing.amount}
          loanRate={financing.rate}
          loanTermMonths={financing.termMonths}
          existingDebt={view.company.financials.currentDebt || 0}
        />
      )}
      <Section title="Следующие возможности" icon={ChartLineAscMIcon} description="Что ещё может понадобиться бизнесу — с условиями доступности">
        <div className="op-opportunities">{financing.opportunities.map((item) => <article key={item.code} className="op-opportunity" data-available={item.available}>
          <IconTile icon={opportunityIcons[item.code] ?? CashMoneyMIcon} tone={item.available ? 'accent' : 'neutral'} size={48} />
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          {item.condition && <p className="op-muted op-small">{item.condition}</p>}
          <Button view={item.available ? 'secondary' : 'outlined'} size={48} disabled={!item.available} onClick={() => navigate({ name: 'new' })}>
            {item.available ? 'Оформить' : 'Пока недоступно'}</Button>
        </article>)}</div>
      </Section>
    </div>
    <Section title="Условия договора" icon={DocumentLinesMIcon} className="op-history">
      <Facts items={[['Выдано', formatDate(financing.issuedAt)], ['Платежей осталось', String(financing.installmentsLeft)],
        ['Ежемесячный платёж', <Money key="p" value={financing.monthlyPayment} />]]} />
      <History view={view} />
    </Section>
  </div>;
}
