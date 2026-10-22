// Result of an application: what happened, why, and what to do next.
import { useState } from 'react';
import { creditApi, type ApplicationView } from './api';
import { ErrorNote, OutcomeBadge, ReasonList, Section } from './ui';
import { errorMessage, formatDateTime, formatRub, months } from './format';
import { navigate } from './routes';
import { ActionButton } from '../shared/Controls';
import type { OfferTerms } from '../../api-server/credit/types';

function Offer({ offer, productName, requested }: { offer: OfferTerms; productName: string; requested?: { amount: number; term: number } }) {
  return <div className="cc-offer">
    <div><span className="cc-muted">Сумма</span><strong>{formatRub(offer.amount)}</strong>
      {requested && requested.amount !== offer.amount && <s className="cc-muted">{formatRub(requested.amount)}</s>}</div>
    <div><span className="cc-muted">Срок</span><strong>{months(offer.termMonths)}</strong>
      {requested && requested.term !== offer.termMonths && <s className="cc-muted">{months(requested.term)}</s>}</div>
    <div><span className="cc-muted">Ставка</span><strong>{offer.rate}% годовых</strong></div>
    <div><span className="cc-muted">Платёж в месяц</span><strong>{formatRub(offer.monthlyPayment)}</strong></div>
    <div className="cc-offer-product"><span className="cc-muted">Продукт</span><strong>{productName}</strong></div>
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
  const offer = app.acceptedOffer ?? decision?.offer ?? null;
  const productName = view.offerProduct?.name ?? view.product?.name ?? '';
  const requested = app.requestedAmount && app.requestedTermMonths ? { amount: app.requestedAmount, term: app.requestedTermMonths } : undefined;
  const headline = state === 'COMPLETED' ? 'Договор подписан' : state === 'OFFER_ACCEPTED' ? 'Предложение принято'
    : decision?.outcome === 'APPROVED' ? 'Заявка одобрена' : decision?.outcome === 'COUNTER_OFFER' ? 'У нас есть встречное предложение'
      : decision?.outcome === 'REJECTED' ? 'Заявка не одобрена' : 'Решение по заявке';
  return <div className="cc-result" data-outcome={decision?.outcome}>
    <Section title={headline} aside={decision && <OutcomeBadge outcome={decision.outcome} />} className="cc-result-main">
      <h3>Что произошло</h3>
      <p className="cc-result-summary">{state === 'COMPLETED' ? 'Договор подписан в демонстрационном режиме. Подписание смоделировано, деньги не перечисляются.'
        : state === 'OFFER_ACCEPTED' ? 'Вы приняли предложение. Осталось подписать договор.' : decision?.summary}</p>
      {offer && <Offer offer={offer} productName={productName} requested={decision?.outcome === 'COUNTER_OFFER' ? requested : undefined} />}
      {decision && decision.reasons.length > 0 && <>
        <h3>Почему</h3>
        <ReasonList reasons={decision.reasons} />
      </>}
      <h3>Что дальше</h3>
      <p>{state === 'COMPLETED' ? 'В реальном процессе здесь была бы выдача средств. В демо сценарий завершён.'
        : state === 'OFFER_ACCEPTED' ? 'Подпишите договор. В демо подписание моделируется — электронная подпись не создаётся.' : decision?.nextAction}</p>
      {error && <ErrorNote error={error} />}
      <div className="cc-actions">
        {(state === 'APPROVED' || state === 'COUNTER_OFFER') &&
          <ActionButton className="primary" disabled={busy} onClick={() => void act(() => creditApi.accept(app.id))}>
            {state === 'COUNTER_OFFER' ? 'Принять встречное предложение' : 'Принять предложение'}</ActionButton>}
        {state === 'OFFER_ACCEPTED' &&
          <ActionButton className="primary" disabled={busy} onClick={() => void act(() => creditApi.sign(app.id))}>Подписать договор (симуляция)</ActionButton>}
        {(state === 'COUNTER_OFFER' || state === 'REJECTED' || state === 'COMPLETED') &&
          <ActionButton className="secondary" onClick={() => navigate({ name: 'new' })}>Новая заявка</ActionButton>}
        <ActionButton className="secondary" onClick={() => navigate({ name: 'dashboard' })}>На главную</ActionButton>
      </div>
    </Section>
    <Section title="История заявки" className="cc-history">
      <ol className="cc-history-list">{view.timeline.map((event) => <li key={event.sequence}>
        <span className="cc-muted">{formatDateTime(event.createdAt)}</span>{event.message}
      </li>)}</ol>
    </Section>
  </div>;
}
