// Processing timeline. The server runs all stages atomically; the client replays the recorded stages
// so the applicant sees what is happening, in plain language.
import { useEffect, useRef, useState } from 'react';
import { creditApi, type ApplicationView, type ProcessedView } from './api';
import { ErrorNote, Section } from './ui';
import { ClockMIcon } from '@alfalab/icons-glyph/ClockMIcon';
import { CheckmarkMIcon } from '@alfalab/icons-glyph/CheckmarkMIcon';
import { errorMessage } from './format';
import type { ApplicationState } from '../../api-server/credit/types';

export const processingStages: { state: ApplicationState; title: string; detail: string }[] = [
  { state: 'VALIDATING', title: 'Проверяем данные компании', detail: 'Полнота заявки и условия выбранного продукта' },
  { state: 'ENRICHING', title: 'Получаем сведения', detail: 'Регистрация компании, кредитная история и финансовые показатели' },
  { state: 'RISK_ASSESSMENT', title: 'Оцениваем риски', detail: 'Модель риска сопоставляет показатели бизнеса с похожими компаниями' },
  { state: 'SCORING', title: 'Оцениваем заявку', detail: 'Срок работы, платёжная дисциплина, долговая нагрузка и прибыльность' },
  { state: 'DECISION', title: 'Формируем решение', detail: 'Подбираем сумму, срок и ставку, которые бизнес сможет обслуживать' },
];

/** Stages and check messages recorded for the latest submission. */
export function latestRun(view: Pick<ApplicationView, 'timeline'>) {
  const start = view.timeline.map((e) => e.state).lastIndexOf('SUBMITTED');
  const events = start < 0 ? [] : view.timeline.slice(start + 1);
  return {
    stages: processingStages.filter((stage) => events.some((e) => e.type === 'STATE_CHANGED' && e.state === stage.state)).length,
    checks: events.filter((e) => e.type === 'CHECK_COMPLETED').map((e) => e.message),
  };
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function ApplicationProcessing({ view, onDone }: { view: ApplicationView; onDone: (view: ApplicationView) => void }) {
  const [shown, setShown] = useState(0);
  const [result, setResult] = useState<ProcessedView | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, reducedMotion() ? Math.min(ms, 120) : ms));
    (async () => {
      try {
        setError('');
        if (view.application.state === 'READY_TO_SUBMIT') await creditApi.submit(view.application.id);
        const processed = await creditApi.process(view.application.id);
        if (!mounted.current) return;
        setResult(processed);
        const run = latestRun(processed);
        for (let stage = 1; stage <= run.stages; stage++) { await wait(stage === 1 ? 500 : 750); if (mounted.current) setShown(stage); }
        await wait(600);
        if (mounted.current) onDone(processed);
      } catch (e) {
        if (!mounted.current) return;
        setError(errorMessage(e));
        // A concurrent request may already have processed the application; show its actual state.
        creditApi.application(view.application.id).then((current) => { if (mounted.current && !['SUBMITTED', 'READY_TO_SUBMIT'].includes(current.application.state)) onDone(current); }).catch(() => {});
      }
    })();
  }, [attempt, view.application.id, view.application.state, onDone]);

  const run = result ? latestRun(result) : { stages: processingStages.length, checks: [] };
  return <Section title="Рассматриваем заявку" icon={ClockMIcon} className="op-processing"
    description="Обычно это занимает несколько секунд. Можно не закрывать страницу.">
    <ol className="op-timeline" aria-live="polite">
      {processingStages.slice(0, Math.max(run.stages, 1)).map((stage, index) => {
        const state = index < shown ? 'done' : index === shown ? 'active' : 'todo';
        return <li key={stage.state} data-state={state}>
          <span className="op-timeline-dot" aria-hidden="true">{state === 'done' ? <CheckmarkMIcon /> : state === 'active' ? <span className="op-spinner" /> : index + 1}</span>
          <div>
            <strong>{stage.title}</strong>
            <span className="op-muted">{stage.detail}</span>
            {stage.state === 'ENRICHING' && state === 'done' && run.checks.length > 0 &&
              <ul className="op-subchecks">{run.checks.map((message) => <li key={message}>{message}</li>)}</ul>}
          </div>
        </li>;
      })}
    </ol>
    {error && <ErrorNote error={error} onRetry={() => setAttempt(attempt + 1)} />}
  </Section>;
}
