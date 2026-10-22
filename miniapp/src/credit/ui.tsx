// Small presentational building blocks of the credit cabinet.
import type { ReactNode } from 'react';
import { Icon } from '../shared/Icon';
import type { ApplicationState, DecisionOutcome, DecisionReason } from '../../api-server/credit/types';
import { clientStateLabels, outcomeLabels } from '../../api-server/credit/labels';

export const SYNTHETIC_LABEL = 'Синтетические демонстрационные данные';

export function SyntheticBadge({ text = SYNTHETIC_LABEL }: { text?: string }) {
  return <span className="cc-badge cc-badge-synthetic"><Icon name="info" size={14} />{text}</span>;
}

const tone = (state: ApplicationState): string =>
  state === 'APPROVED' || state === 'OFFER_ACCEPTED' || state === 'COMPLETED' ? 'success'
    : state === 'COUNTER_OFFER' || state === 'NEEDS_INFO' ? 'warning'
      : state === 'REJECTED' ? 'danger'
        : state === 'READY_TO_SUBMIT' ? 'accent' : 'neutral';

export function StatusBadge({ state, internal = false }: { state: ApplicationState; internal?: boolean }) {
  return <span className={`cc-badge cc-tone-${tone(state)}`} data-state={state}>{internal ? state : clientStateLabels[state].title}</span>;
}

export function OutcomeBadge({ outcome }: { outcome: DecisionOutcome }) {
  return <span className={`cc-badge cc-tone-${tone(outcome)}`}>{outcomeLabels[outcome]}</span>;
}

export function Section({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`cc-card ${className}`}>
    <header className="cc-card-header"><h2>{title}</h2>{aside}</header>
    {children}
  </section>;
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return <dl className="cc-facts">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return <div className="cc-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
    <span style={{ width: `${percent}%` }} />
  </div>;
}

const reasonIcon: Record<DecisionReason['kind'], string> = { positive: '✓', warning: '⚠', negative: '✕', info: 'ℹ' };
export function ReasonList({ reasons }: { reasons: DecisionReason[] }) {
  return <ul className="cc-reasons">{reasons.map((reason) =>
    <li key={reason.code + reason.text} className={`cc-reason-${reason.kind}`}><span aria-hidden="true">{reasonIcon[reason.kind]}</span>{reason.text}</li>)}
  </ul>;
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return <div className="cc-alert cc-alert-danger" role="alert">
    <span>{error}</span>
    {onRetry && <button type="button" className="cc-link" onClick={onRetry}>Повторить</button>}
  </div>;
}

export function Loading({ text = 'Загружаем…' }: { text?: string }) {
  return <p className="cc-loading" role="status"><span className="cc-spinner" aria-hidden="true" />{text}</p>;
}

export const flowSteps = ['Компания', 'Потребность', 'Продукт', 'Заявка', 'Решение'] as const;
export function FlowSteps({ current }: { current: number }) {
  return <ol className="cc-steps" aria-label="Этапы получения финансирования">
    {flowSteps.map((step, index) => <li key={step} data-state={index < current ? 'done' : index === current ? 'current' : 'todo'}
      aria-current={index === current ? 'step' : undefined}>
      <span className="cc-step-dot">{index < current ? '✓' : index + 1}</span>{step}
    </li>)}
  </ol>;
}
