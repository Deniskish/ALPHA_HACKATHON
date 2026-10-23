// One CreditApplication through five visible stages: Потребность → Подбор → Анкета → Рассмотрение → Решение.
import { useCallback, useEffect, useState } from 'react';
import { creditApi, type ApplicationView } from './api';
import { ErrorNote, FlowSteps, Loading, StatusBadge } from './ui';
import { errorMessage } from './format';
import { navigate, stages, type Stage } from './routes';
import { NeedEdit } from './NeedStep';
import { MatchStep } from './MatchStep';
import { FormStep } from './FormStep';
import { ApplicationProcessing } from './ApplicationProcessing';
import { ApplicationResult } from './ApplicationResult';
import { editableStates, processingStates } from '../../api-server/credit/state-machine';

/** Furthest stage the application has reached, derived from its server-side state. */
export function reachedStage(view: Pick<ApplicationView, 'application'>): Stage {
  const app = view.application;
  if (processingStates.includes(app.state)) return 'review';
  if (!editableStates.includes(app.state)) return 'decision';
  if (app.state === 'NEEDS_INFO') return 'form';
  return app.productId ? 'form' : 'match';
}

export function ApplicationPage({ id, stage }: { id: string; stage?: Stage }) {
  const [view, setView] = useState<ApplicationView | null>(null);
  const [error, setError] = useState('');
  /** Set after «Отправить»: the review stage submits, processes and replays the recorded stages. */
  const [processing, setProcessing] = useState(false);
  const load = useCallback((signal?: AbortSignal) => {
    setError('');
    creditApi.application(id, signal).then(setView).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
  }, [id]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);

  if (error && !view) return <div className="op-page"><ErrorNote error={error} onRetry={() => load()} /></div>;
  if (!view) return <div className="op-page"><Loading text="Загружаем заявку…" /></div>;
  const reached = processing ? 'review' : reachedStage(view);
  const reachedIndex = stages.indexOf(reached);
  // A stage beyond the reached one is not available; processing always shows the review stage.
  const shown: Stage = processing || reached === 'review' ? 'review'
    : stage && stages.indexOf(stage) <= reachedIndex && stage !== 'review' ? stage : reached;
  const go = (index: number) => { if (index <= reachedIndex && stages[index] !== 'review') navigate({ name: 'application', id, stage: stages[index] }); };
  return <div className="op-page">
    <nav className="op-breadcrumbs"><a href="#/">Кабинет</a><span>Заявка {view.application.number}</span></nav>
    <header className="op-page-header">
      <div>
        <h1>Заявка {view.application.number}</h1>
        <p className="op-muted">{view.company.name} · ИНН {view.company.inn} · {view.company.relationship === 'client' ? 'клиент банка' : 'не клиент банка'}</p>
      </div>
      <div className="op-status-box" aria-live="polite">
        <StatusBadge state={view.application.state} />
        <span><span className="op-muted">Следующий шаг:</span> {view.status.next}</span>
      </div>
    </header>
    <FlowSteps current={stages.indexOf(shown)} reachable={reachedIndex} onSelect={processing ? undefined : go} />
    {shown === 'need' && <NeedEdit view={view} onChange={setView} />}
    {shown === 'match' && <MatchStep view={view} onChange={(next) => { setView(next); navigate({ name: 'application', id, stage: 'form' }); }} />}
    {shown === 'form' && <FormStep view={view} onChange={setView} onSubmit={() => setProcessing(true)} />}
    {shown === 'review' && <ApplicationProcessing view={view} onDone={(next) => { setView(next); setProcessing(false); navigate({ name: 'application', id, stage: next.status.editable ? 'form' : 'decision' }); }} />}
    {shown === 'decision' && <ApplicationResult view={view} onChange={setView} />}
  </div>;
}
