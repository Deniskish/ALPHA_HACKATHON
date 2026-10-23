// «Как улучшить заявку» — central feature of «Опора»: actionable recommendations and what-if scenarios
// computed by the same pipeline. Wording is deliberately cautious: «расчётный сценарий», «ориентировочный результат».
import { useEffect, useState } from 'react';
import { creditApi, type Improvements as Data } from './api';
import { ErrorNote, Loading, Section } from './ui';
import { errorMessage, formatRub, months } from './format';
import { Explanation } from './Explanation';
import { outcomeLabels, riskLabels } from '../../api-server/credit/labels';

const affordabilityLabel = { ok: 'комфортно', tight: 'на пределе', over: 'выше допустимого', unknown: '—' } as const;

export function Improvements({ applicationId, attempt }: { applicationId: string; attempt: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    creditApi.improvements(applicationId, controller.signal).then(setData).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
    return () => controller.abort();
  }, [applicationId, attempt]);
  return <Section title="Как улучшить заявку" className="op-improve" aside={<span className="op-pill op-pill-accent">Расчётные сценарии</span>}>
    {error && <ErrorNote error={error} />}
    {!data && !error && <Loading text="Считаем сценарии…" />}
    {data && <>
      <p className="op-muted">{data.disclaimer}</p>
      {data.hardStop && <p className="op-alert op-alert-warning" role="status">{data.hardStop}</p>}
      {data.recommendations.length > 0 && <ul className="op-recommendations">{data.recommendations.map((r) => <li key={r.code}>
        <strong>{r.title}</strong><span>{r.text}</span><small>{r.effect}</small>
      </li>)}</ul>}
      <div className="op-scenarios" role="table" aria-label="Расчётные сценарии">
        <div className="op-scenario op-scenario-head" role="row">
          <span role="columnheader">Сценарий</span><span role="columnheader">Платёж</span><span role="columnheader">Нагрузка на прибыль</span>
          <span role="columnheader">Оценка</span><span role="columnheader">Риск</span><span role="columnheader">Ориентировочный результат</span>
        </div>
        {[data.current, ...data.scenarios].map((s) => <div key={`${s.amount}-${s.termMonths}`} className="op-scenario" role="row" data-current={s.current} data-outcome={s.outcome}>
          <span role="cell" data-label="Сценарий"><strong>{formatRub(s.amount)}</strong> на {months(s.termMonths)}{s.current && <em> · текущая заявка</em>}</span>
          <span role="cell" data-label="Платёж">{formatRub(s.monthlyPayment)}</span>
          <span role="cell" data-label="Нагрузка на прибыль">{s.paymentToProfit === null ? '—' : `${Math.round(s.paymentToProfit * 100)}% · ${affordabilityLabel[s.affordability]}`}</span>
          <span role="cell" data-label="Оценка">{s.score} / 100</span>
          <span role="cell" data-label="Риск">{s.mlRiskLevel ? riskLabels[s.mlRiskLevel] : riskLabels[s.scoreRiskLevel]}</span>
          <span role="cell" data-label="Ориентировочный результат" className="op-scenario-outcome">{outcomeLabels[s.outcome]}
            {s.outcome === 'COUNTER_OFFER' && s.offerAmount ? ` · до ${formatRub(s.offerAmount)}` : ''}</span>
        </div>)}
      </div>
      <Explanation applicationId={applicationId} attempt={attempt} kind="improvements" />
    </>}
  </Section>;
}
