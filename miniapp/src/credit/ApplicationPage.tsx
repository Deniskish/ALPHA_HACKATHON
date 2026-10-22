// Chooses the screen by the server-side state: workspace → processing → result.
import { useCallback, useEffect, useState } from 'react';
import { creditApi, type ApplicationView } from './api';
import { ErrorNote, FlowSteps, Loading, StatusBadge } from './ui';
import { errorMessage } from './format';
import { ApplicationWorkspace } from './ApplicationWorkspace';
import { ApplicationProcessing } from './ApplicationProcessing';
import { ApplicationResult } from './ApplicationResult';
import { editableStates, processingStates } from '../../api-server/credit/state-machine';

export function ApplicationPage({ id }: { id: string }) {
  const [view, setView] = useState<ApplicationView | null>(null);
  const [error, setError] = useState('');
  /** Set after "Отправить": the processing screen submits, processes and animates the stages. */
  const [processing, setProcessing] = useState(false);
  const load = useCallback((signal?: AbortSignal) => {
    setError('');
    creditApi.application(id, signal).then(setView).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
  }, [id]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);

  if (error && !view) return <div className="cc-page"><ErrorNote error={error} onRetry={() => load()} /></div>;
  if (!view) return <div className="cc-page"><Loading text="Загружаем заявку…" /></div>;
  const state = view.application.state;
  const showProcessing = processing || processingStates.includes(state);
  const step = editableStates.includes(state) && !showProcessing ? 3 : 4;
  return <div className="cc-page">
    <nav className="cc-breadcrumbs"><a href="#/">Главная</a><span>Заявка {view.application.number}</span></nav>
    <header className="cc-page-header">
      <div>
        <h1>Заявка {view.application.number}</h1>
        <p className="cc-muted">{view.company.name} · ИНН {view.company.inn}</p>
      </div>
      <div className="cc-status-box" aria-live="polite">
        <StatusBadge state={state} />
        <span><span className="cc-muted">Следующий шаг:</span> {view.status.next}</span>
      </div>
    </header>
    <FlowSteps current={step} />
    {showProcessing
      ? <ApplicationProcessing view={view} onDone={(next) => { setView(next); setProcessing(false); }} />
      : editableStates.includes(state)
        ? <ApplicationWorkspace view={view} onChange={setView} onSubmit={() => setProcessing(true)} />
        : <ApplicationResult view={view} onChange={setView} />}
  </div>;
}
