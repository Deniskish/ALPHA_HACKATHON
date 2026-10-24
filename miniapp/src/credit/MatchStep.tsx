// Step 2 «Подбор»: products for the need, explained: why it fits, which data was used, limits, cost, payment, risks, alternatives.
import { useEffect, useState } from 'react';
import { Button } from '@alfalab/core-components-button';
import { creditApi, type ApplicationView, type MatchesView } from './api';
import { ErrorNote, Facts, formatPercent, IconTile, Loading, Money, Note, Rate, Reveal, Section, SyntheticBadge } from './ui';
import { purposeIcons } from './purpose-icons';
import { CheckmarkMIcon } from '@alfalab/icons-glyph/CheckmarkMIcon';
import { CrossMIcon } from '@alfalab/icons-glyph/CrossMIcon';
import { ExclamationCircleMIcon } from '@alfalab/icons-glyph/ExclamationCircleMIcon';
import { ArrowRightMIcon } from '@alfalab/icons-glyph/ArrowRightMIcon';
import { MagnifierMIcon } from '@alfalab/icons-glyph/MagnifierMIcon';
import { errorMessage, formatRub, months } from './format';
import { navigate } from './routes';
import { purposeLabels } from '../../api-server/credit/labels';
import type { ProductMatch } from '../../api-server/credit/matching';

const affordabilityText: Record<ProductMatch['affordability']['status'], string> = {
  ok: 'Комфортная нагрузка', tight: 'Нагрузка близка к пределу', unaffordable: 'Нагрузка выше допустимой', unknown: 'Оценим после анкеты',
};

export function MatchStep({ view, onChange }: { view: ApplicationView; onChange: (view: ApplicationView) => void }) {
  const app = view.application;
  const [data, setData] = useState<MatchesView | null>(null);
  const [error, setError] = useState('');
  const [choosing, setChoosing] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    creditApi.matches(app.id, controller.signal).then(setData).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
    return () => controller.abort();
  }, [app.id, app.version]);
  const choose = async (productId: string) => {
    if (!view.status.editable) return;
    setChoosing(productId); setError('');
    try { onChange(await creditApi.update(app.id, { productId, version: app.version })); }
    catch (e) { setError(errorMessage(e)); setChoosing(''); }
  };
  const facts = data?.facts;
  return <div className="op-stack">
    <Section title="Что мы учли при подборе" icon={MagnifierMIcon} aside={<SyntheticBadge text="Продукты и ставки синтетические" />}>
      <p className="op-need-summary">{app.purpose ? purposeLabels[app.purpose] : '—'} · <strong>{app.requestedAmount ? formatRub(app.requestedAmount) : '—'}</strong>
        {app.requestedTermMonths ? ` на ${months(app.requestedTermMonths)}` : ''}
        <button type="button" className="op-link" onClick={() => navigate({ name: 'application', id: app.id, stage: 'need' })}>Изменить</button></p>
      {facts && <Facts items={[
        ['Ключевая ставка (демо)', formatPercent(data!.keyRate)],
        ['Финансы', facts.financeSource === 'bank' ? 'по данным банка' : facts.financeSource === 'declared' ? 'по вашим данным' : 'нет данных — уточним в анкете'],
        ['Выручка / прибыль', facts.revenue !== null ? `${formatRub(facts.revenue)} / ${formatRub(facts.profit ?? 0)}` : '—'],
        ['Текущие долги', facts.debt !== null ? formatRub(facts.debt) : '—'],
        ['Кредитная история', facts.hasCreditHistory === null ? '—' : !facts.hasCreditHistory ? 'нет истории' : facts.maxDaysOverdue ? `просрочки до ${facts.maxDaysOverdue} дн.` : 'без просрочек'],
        ['Предварительный риск', facts.riskLevel === 'LOW' ? 'низкий' : facts.riskLevel === 'MEDIUM' ? 'средний' : facts.riskLevel === 'HIGH' ? 'высокий' : 'оценим позже'],
      ]} />}
      <p className="op-muted op-small">Ставка в демо-модели = ключевая ставка + маржа продукта + надбавка за риск. Это иллюстрация подхода, а не формула какого-либо банка.</p>
    </Section>
    {error && <ErrorNote error={error} />}
    {!data && !error && <Loading text="Подбираем финансирование…" />}
    {data && !data.matches.some((m) => m.eligible) && <Note view="attention" title="Ни один продукт не подходит под эти параметры. Измените сумму, срок или цель." />}
    <div className="op-products">{data?.matches.map((match) => <ProductCard key={match.product.id} match={match} selected={app.productId === match.product.id}
      disabled={!view.status.editable || !!choosing} busy={choosing === match.product.id} onChoose={() => void choose(match.product.id)} />)}</div>
  </div>;
}

function ProductCard({ match, selected, disabled, busy, onChoose }: { match: ProductMatch; selected: boolean; disabled: boolean; busy: boolean; onChoose: () => void }) {
  const { product, pricing, eligible } = match;
  const failed = eligible ? undefined : match.checks.find((check) => !check.ok);
  const fit = <>
    <h4>{eligible ? 'Почему подходит' : 'Почему не подходит'}</h4>
    <ul className="op-checks">{match.checks.map((check) => <li key={check.code} data-ok={check.ok}>{check.ok ? <CheckmarkMIcon aria-hidden="true" /> : <CrossMIcon aria-hidden="true" />}{check.text}</li>)}
      {eligible && match.fitReasons.slice(match.checks.length).map((reason) => <li key={reason} data-ok="true"><CheckmarkMIcon aria-hidden="true" />{reason}</li>)}</ul>
  </>;
  const caveats = <>
    {match.risks.length > 0 && <><h4>Риски</h4><ul className="op-checks">{match.risks.map((risk) => <li key={risk} data-ok="warn"><ExclamationCircleMIcon aria-hidden="true" />{risk}</li>)}</ul></>}
    {match.alternatives.length > 0 && <><h4>Альтернативы</h4><ul className="op-checks">{match.alternatives.map((alt) => <li key={alt} data-ok="alt"><ArrowRightMIcon aria-hidden="true" />{alt}</li>)}</ul></>}
    <details className="op-details">
      <summary>Какие данные использованы и ограничения</summary>
      <ul className="op-plain">{match.dataUsed.map((item) => <li key={item}>{item}</li>)}</ul>
      <ul className="op-plain">{match.constraints.map((item) => <li key={item}>{item}</li>)}</ul>
    </details>
  </>;
  return <article className="op-product" data-eligible={eligible} data-recommended={match.recommended} data-product={product.id}>
    <header>
      <IconTile icon={purposeIcons[product.purposes[0]]} tone={match.recommended ? 'inverted' : 'neutral'} size={48} />
      <div className="op-product-title">
        {match.recommended && <span className="op-pill op-pill-accent">Рекомендуем</span>}
        <h3>{product.name}</h3>
        <span className="op-product-range"><Money value={product.minAmount} /> – <Money value={product.maxAmount} /> · до {months(product.maxTermMonths)}</span>
      </div>
      {selected && !match.recommended && <span className="op-pill">Выбран</span>}
    </header>
    <p className="op-product-description">{product.description}</p>
    <div className="op-price">
      <div className="op-price-rate"><span className="op-price-label">Ставка</span><Rate rate={pricing.rate} pricing={pricing} /></div>
      <div><span className="op-price-label">Платёж в месяц</span><strong>{match.estimatedMonthlyPayment ? <Money value={match.estimatedMonthlyPayment} /> : '—'}</strong>
        <small data-status={match.affordability.status}>{affordabilityText[match.affordability.status]}</small></div>
      <div><span className="op-price-label">Переплата</span><strong>{match.totalCost ? <Money value={match.totalCost} /> : '—'}</strong><small>ориентировочно</small></div>
    </div>
    {match.recommended ? <>{fit}<Reveal summary="Риски, альтернативы и данные">{caveats}</Reveal></>
      : <Reveal summary={<>{eligible ? 'Почему подходит' : 'Почему не подходит'}{failed && <small>{failed.text}</small>}</>}>{fit}{caveats}</Reveal>}
    <Button view={match.recommended ? 'accent' : 'secondary'} size={56} block disabled={!eligible || disabled} loading={busy} onClick={onChoose}
      rightAddons={eligible ? <ArrowRightMIcon /> : undefined}>
      {eligible ? (selected ? 'Продолжить с этим продуктом' : 'Выбрать продукт') : 'Недоступен'}</Button>
  </article>;
}
