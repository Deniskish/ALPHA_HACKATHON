// Building blocks of «Опора» on top of the Alfa design system (@alfalab/core-components).
import type { ReactNode } from 'react';
import { Status } from '@alfalab/core-components-status';
import { Steps } from '@alfalab/core-components-steps';
import { Tooltip } from '@alfalab/core-components-tooltip';
import { ProgressBar as AlfaProgressBar } from '@alfalab/core-components-progress-bar';
import type { ApplicationState, DecisionOutcome, DecisionReason } from '../../api-server/credit/types';
import { clientStateLabels, outcomeLabels } from '../../api-server/credit/labels';

export const SYNTHETIC_LABEL = 'Синтетические демонстрационные данные';

export function SyntheticBadge({ text = SYNTHETIC_LABEL }: { text?: string }) {
  return <span className="op-synthetic" role="note">{text}</span>;
}

type Tone = 'green' | 'orange' | 'red' | 'blue' | 'grey';
const tone = (state: ApplicationState): Tone =>
  state === 'APPROVED' || state === 'OFFER_ACCEPTED' || state === 'COMPLETED' || state === 'ACTIVE_FINANCING' ? 'green'
    : state === 'COUNTER_OFFER' || state === 'NEEDS_INFO' ? 'orange'
      : state === 'REJECTED' ? 'red'
        : state === 'READY_TO_SUBMIT' ? 'blue' : 'grey';

export function StatusBadge({ state, internal = false }: { state: ApplicationState; internal?: boolean }) {
  return <span className="op-status" data-state={state}><Status color={tone(state)} view="soft">{internal ? state : clientStateLabels[state].title}</Status></span>;
}

export function OutcomeBadge({ outcome }: { outcome: DecisionOutcome }) {
  return <span className="op-status" data-outcome={outcome}><Status color={tone(outcome)} view="soft">{outcomeLabels[outcome]}</Status></span>;
}

export function Section({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`op-card ${className}`}>
    <header className="op-card-header"><h2>{title}</h2>{aside}</header>
    {children}
  </section>;
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return <dl className="op-facts">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return <div className="op-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
    <AlfaProgressBar value={percent} view="positive" />
  </div>;
}

/** «Зачем банк спрашивает это?» — every questionnaire field explains how it is used. */
export function Why({ text }: { text: string }) {
  return <Tooltip content={<span className="op-why-text">{text}</span>} trigger="click" position="top">
    <button type="button" className="op-why" aria-label={`Зачем банк спрашивает: ${text}`}>?</button>
  </Tooltip>;
}

const reasonIcon: Record<DecisionReason['kind'], string> = { positive: '✓', warning: '⚠', negative: '✕', info: 'ℹ' };
export function ReasonList({ reasons }: { reasons: DecisionReason[] }) {
  return <ul className="op-reasons">{reasons.map((reason) =>
    <li key={reason.code + reason.text} className={`op-reason-${reason.kind}`}><span aria-hidden="true">{reasonIcon[reason.kind]}</span>{reason.text}</li>)}
  </ul>;
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return <div className="op-alert op-alert-danger" role="alert">
    <span>{error}</span>
    {onRetry && <button type="button" className="op-link" onClick={onRetry}>Повторить</button>}
  </div>;
}

export function Loading({ text = 'Загружаем…' }: { text?: string }) {
  return <p className="op-loading" role="status"><span className="op-spinner" aria-hidden="true" />{text}</p>;
}

/** The five visible stages of one credit application. */
export const flowSteps = ['Потребность', 'Подбор', 'Анкета', 'Рассмотрение', 'Решение'] as const;
export function FlowSteps({ current, onSelect, reachable = current }: { current: number; onSelect?: (index: number) => void; reachable?: number }) {
  return <nav className="op-steps" aria-label="Этапы получения финансирования">
    <p className="op-steps-compact" aria-hidden="true">Шаг {current + 1} из {flowSteps.length} · <strong>{flowSteps[current]}</strong></p>
    <Steps activeStep={current + 1} isMarkCompletedSteps interactive={!!onSelect}
      checkIsStepDisabled={(step) => step - 1 > reachable} onChange={(step) => onSelect?.(step - 1)}>
      {flowSteps.map((step, index) => <span key={step} aria-current={index === current ? 'step' : undefined}>{step}</span>)}
    </Steps>
  </nav>;
}
