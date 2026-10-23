// Step 5 «Решение»: what happened, why, what to do next — then simulated signing, issue and support after the decision.
import { useState } from 'react';
import { Button } from '@alfalab/core-components-button';
import { creditApi, type ApplicationView } from './api';
import { ErrorNote, Facts, OutcomeBadge, ReasonList, Section } from './ui';
import { errorMessage, formatDate, formatDateTime, formatRub, months } from './format';
import { navigate } from './routes';
import { Improvements } from './Improvements';
import { Explanation } from './Explanation';
import type { OfferTerms } from '../../api-server/credit/types';

function Offer({ offer, productName, requested }: { offer: OfferTerms; productName: string; requested?: { amount: number; term: number } }) {
  return <div className="op-offer">
    <div><span className="op-muted">Сумма</span><strong>{formatRub(offer.amount)}</strong>
      {requested && requested.amount !== offer.amount && <s className="op-muted">{formatRub(requested.amount)}</s>}</div>
    <div><span className="op-muted">Срок</span><strong>{months(offer.termMonths)}</strong>
      {requested && requested.term !== offer.termMonths && <s className="op-muted">{months(requested.term)}</s>}</div>
    <div><span className="op-muted">Ставка</span><strong>{offer.rate}% годовых</strong>
      {offer.pricing && <small className="op-muted">{offer.pricing.keyRate}% ключевая + {offer.pricing.productMargin} маржа{offer.pricing.riskPremium ? ` + ${offer.pricing.riskPremium} за риск` : ''}</small>}</div>
    <div><span className="op-muted">Платёж в месяц</span><strong>{formatRub(offer.monthlyPayment)}</strong></div>
    <div className="op-offer-product"><span className="op-muted">Продукт</span><strong>{productName}</strong></div>
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
  return <div className="op-result" data-outcome={decision?.outcome}>
    <div className="op-stack">
      <Section title={headline} aside={decision && <OutcomeBadge outcome={decision.outcome} />} className="op-result-main">
        <h3>Что произошло</h3>
        <p className="op-result-summary">{state === 'COMPLETED' ? 'Договор подписан в демонстрационном режиме — электронная подпись не создавалась.'
          : state === 'OFFER_ACCEPTED' ? 'Вы приняли предложение. Осталось подписать договор.' : decision?.summary}</p>
        {offer && <Offer offer={offer} productName={productName} requested={decision?.outcome === 'COUNTER_OFFER' ? requested : undefined} />}
        {decision && decision.reasons.length > 0 && <>
          <h3>Почему</h3>
          <ReasonList reasons={decision.reasons} />
        </>}
        <h3>Что дальше</h3>
        <p>{state === 'COMPLETED' ? 'Получите финансирование — выдача в демо моделируется, деньги не перечисляются.'
          : state === 'OFFER_ACCEPTED' ? 'Подпишите договор. В демо подписание моделируется.' : decision?.nextAction}</p>
        {error && <ErrorNote error={error} />}
        <div className="op-actions">
          {(state === 'APPROVED' || state === 'COUNTER_OFFER') &&
            <Button view="accent" size={48} loading={busy} onClick={() => void act(() => creditApi.accept(app.id))}>
              {state === 'COUNTER_OFFER' ? 'Принять встречное предложение' : 'Принять предложение'}</Button>}
          {state === 'OFFER_ACCEPTED' && <Button view="accent" size={48} loading={busy} onClick={() => void act(() => creditApi.sign(app.id))}>Подписать договор (симуляция)</Button>}
          {state === 'COMPLETED' && <Button view="accent" size={48} loading={busy} onClick={() => void act(() => creditApi.issue(app.id))}>Получить финансирование (симуляция)</Button>}
          {(state === 'COUNTER_OFFER' || state === 'REJECTED') &&
            <Button view="secondary" size={48} onClick={() => navigate({ name: 'new' })}>Новая заявка</Button>}
          <Button view="secondary" size={48} onClick={() => navigate({ name: 'dashboard' })}>В кабинет</Button>
        </div>
      </Section>
      {decision && decision.outcome !== 'NEEDS_INFO' && <Explanation applicationId={app.id} attempt={app.attempt} kind="decision" />}
      {improvable && <Improvements applicationId={app.id} attempt={app.attempt} />}
    </div>
    <History view={view} />
  </div>;
}

function History({ view }: { view: ApplicationView }) {
  return <Section title="История заявки" className="op-history">
    <ol className="op-history-list">{view.timeline.map((event) => <li key={event.sequence}>
      <span className="op-muted">{formatDateTime(event.createdAt)}</span>{event.message}
    </li>)}</ol>
  </Section>;
}

function FinancingPanel({ view, busy, error, onPay }: { view: ApplicationView; busy: boolean; error: string; onPay: () => void }) {
  const financing = view.financing!;
  const progress = financing.paidInstallments / financing.termMonths;
  return <div className="op-result" data-outcome="ACTIVE_FINANCING">
    <div className="op-stack">
      <Section title="Финансирование выдано" aside={<span className="op-pill">Симуляция</span>} className="op-result-main">
        <p className="op-result-summary">{financing.summary}</p>
        <div className="op-offer">
          <div><span className="op-muted">Сумма</span><strong>{formatRub(financing.amount)}</strong></div>
          <div><span className="op-muted">Срок</span><strong>{months(financing.termMonths)}</strong></div>
          <div><span className="op-muted">Ставка</span><strong>{financing.rate}% годовых</strong></div>
          <div><span className="op-muted">Остаток долга</span><strong>{formatRub(financing.remainingPrincipal)}</strong></div>
          <div><span className="op-muted">Следующий платёж</span><strong>{financing.nextPayment ? formatRub(financing.nextPayment.amount) : '—'}</strong>
            {financing.nextPayment && <small className="op-muted">{formatDate(financing.nextPayment.date)}</small>}</div>
          <div><span className="op-muted">Статус</span><strong>{financing.status === 'REPAID' ? 'Погашен' : 'Действует'}</strong></div>
        </div>
        <div className="op-progress-line" aria-label={`Оплачено ${financing.paidInstallments} из ${financing.termMonths} платежей`}>
          <span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        <p className="op-muted">Оплачено {financing.paidInstallments} из {financing.termMonths} платежей · продукт «{financing.productName}»</p>
        {error && <ErrorNote error={error} />}
        <div className="op-actions">
          {financing.status === 'ACTIVE' && <Button view="secondary" size={48} loading={busy} onClick={onPay}>Смоделировать очередной платёж</Button>}
          <Button view="secondary" size={48} onClick={() => navigate({ name: 'dashboard' })}>В кабинет</Button>
        </div>
        <p className="op-muted op-small">Платежи и проводки не выполняются: график рассчитывается из условий договора для демонстрации сопровождения.</p>
      </Section>
      <Section title="Следующие возможности">
        <div className="op-opportunities">{financing.opportunities.map((item) => <article key={item.code} className="op-opportunity" data-available={item.available}>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          {item.condition && <p className="op-muted op-small">{item.condition}</p>}
          <Button view={item.available ? 'secondary' : 'outlined'} size={40} disabled={!item.available} onClick={() => navigate({ name: 'new' })}>
            {item.available ? 'Оформить' : 'Пока недоступно'}</Button>
        </article>)}</div>
      </Section>
    </div>
    <Section title="Условия договора" className="op-history">
      <Facts items={[['Выдано', formatDate(financing.issuedAt)], ['Платежей осталось', String(financing.installmentsLeft)],
        ['Ежемесячный платёж', formatRub(financing.monthlyPayment)]]} />
      <History view={view} />
    </Section>
  </div>;
}
