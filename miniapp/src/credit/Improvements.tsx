// «Как улучшить заявку» — central feature of «Опора»: actionable recommendations and what-if scenarios
// computed by the same pipeline. Wording is deliberately cautious: «расчётный сценарий», «ориентировочный результат».
import { useEffect, useState } from 'react';
import { ClockMIcon } from '@alfalab/icons-glyph/ClockMIcon';
import { ScalesMIcon } from '@alfalab/icons-glyph/ScalesMIcon';
import { CalculatorMIcon } from '@alfalab/icons-glyph/CalculatorMIcon';
import { CalendarMIcon } from '@alfalab/icons-glyph/CalendarMIcon';
import { ChartLineAscMIcon } from '@alfalab/icons-glyph/ChartLineAscMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { DiagramMIcon } from '@alfalab/icons-glyph/DiagramMIcon';
import { MagicWandMIcon } from '@alfalab/icons-glyph/MagicWandMIcon';
import { creditApi, type Improvements as Data } from './api';
import { ErrorNote, IconTile, Loading, Money, Note, OutcomeBadge, Section, type GlyphIcon } from './ui';
import { errorMessage, months } from './format';
import { Explanation } from './Explanation';
import { riskLabels } from '../../api-server/credit/labels';

const affordabilityLabel = { ok: 'комфортно', tight: 'на пределе', over: 'выше допустимого', unknown: '—' } as const;
const recommendationIcons: Record<string, GlyphIcon> = { PAY_OVERDUE: ClockMIcon, REDUCE_DEBT: ScalesMIcon, SMALLER_AMOUNT: CalculatorMIcon,
  LONGER_TERM: CalendarMIcon, PROFITABILITY: ChartLineAscMIcon, COMPLETE_FORM: DocumentLinesMIcon, ML_FACTORS: DiagramMIcon };

/** Payment as a share of monthly profit; the 50% mark is the affordability limit of the demo policy. */
function LoadMeter({ share, status }: { share: number | null; status: keyof typeof affordabilityLabel }) {
  if (share === null) return <span className="op-muted">—</span>;
  return <span className="op-meter" data-status={status}>
    <span className="op-meter-track"><span style={{ width: `${Math.min(100, share * 100)}%` }} /><i aria-hidden="true" /></span>
    <span>{Math.round(share * 100)}% · {affordabilityLabel[status]}</span>
  </span>;
}

export function Improvements({ applicationId, attempt }: { applicationId: string; attempt: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    creditApi.improvements(applicationId, controller.signal).then(setData).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
    return () => controller.abort();
  }, [applicationId, attempt]);
  const best = data?.scenarios[0];
  return <Section title="Как улучшить заявку" icon={MagicWandMIcon} className="op-improve" aside={<span className="op-pill op-pill-accent">Расчётные сценарии</span>}
    description="Пересчитали заявку с другими параметрами по той же модели оценки">
    {error && <ErrorNote error={error} />}
    {!data && !error && <Loading text="Считаем сценарии…" />}
    {data && <>
      {data.hardStop && <Note view="attention" title={data.hardStop} />}
      {best && !data.hardStop && <div className="op-spotlight">
        <span className="op-spotlight-label">Лучший расчётный сценарий</span>
        <strong><Money value={best.amount} /> на {months(best.termMonths)}</strong>
        <span>Платёж <Money value={best.monthlyPayment} /> в месяц{best.paymentToProfit !== null ? ` · ${Math.round(best.paymentToProfit * 100)}% прибыли` : ''}</span>
        <span className="op-spotlight-outcome">Ориентировочный результат: <OutcomeBadge outcome={best.outcome} /></span>
      </div>}
      {data.recommendations.length > 0 && <ul className="op-recommendations">{data.recommendations.map((r) => <li key={r.code}>
        <IconTile icon={recommendationIcons[r.code] ?? MagicWandMIcon} size={40} />
        <strong>{r.title}</strong><span>{r.text}</span><small>{r.effect}</small>
      </li>)}</ul>}
      <div className="op-scenarios" role="table" aria-label="Расчётные сценарии">
        <div className="op-scenario op-scenario-head" role="row">
          <span role="columnheader">Сценарий</span><span role="columnheader">Платёж</span><span role="columnheader">Нагрузка на прибыль</span>
          <span role="columnheader">Оценка</span><span role="columnheader">Риск</span><span role="columnheader">Ориентировочный результат</span>
        </div>
        {[data.current, ...data.scenarios].map((s) => <div key={`${s.amount}-${s.termMonths}`} className="op-scenario" role="row" data-current={s.current} data-outcome={s.outcome}>
          <span role="cell" data-label="Сценарий"><strong><Money value={s.amount} /></strong> на {months(s.termMonths)}{s.current && <em> · текущая заявка</em>}</span>
          <span role="cell" data-label="Платёж"><Money value={s.monthlyPayment} /></span>
          <span role="cell" data-label="Нагрузка на прибыль"><LoadMeter share={s.paymentToProfit} status={s.affordability} /></span>
          <span role="cell" data-label="Оценка">{s.score} / 100</span>
          <span role="cell" data-label="Риск">{s.mlRiskLevel ? riskLabels[s.mlRiskLevel] : riskLabels[s.scoreRiskLevel]}</span>
          <span role="cell" data-label="Ориентировочный результат" className="op-scenario-outcome"><OutcomeBadge outcome={s.outcome} />
            {s.outcome === 'COUNTER_OFFER' && s.offerAmount ? <small> до <Money value={s.offerAmount} /></small> : null}</span>
        </div>)}
      </div>
      <p className="op-muted op-small">{data.disclaimer}</p>
      <Explanation applicationId={applicationId} attempt={attempt} kind="improvements" />
    </>}
  </Section>;
}
