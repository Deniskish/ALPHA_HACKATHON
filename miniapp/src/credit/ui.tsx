// Building blocks of «Опора» on top of the Alfa design system (@alfalab/core-components, @alfalab/icons-glyph).
// The only own visual asset is the original «Опора» logo.
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Status } from '@alfalab/core-components-status';
import { Steps } from '@alfalab/core-components-steps';
import { Tooltip } from '@alfalab/core-components-tooltip';
import { ProgressBar as AlfaProgressBar } from '@alfalab/core-components-progress-bar';
import { Typography } from '@alfalab/core-components-typography';
import { Plate } from '@alfalab/core-components-plate';
import { Amount } from '@alfalab/core-components-amount';
import { SuperEllipse } from '@alfalab/core-components-icon-view/super-ellipse';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { ExclamationCircleMIcon } from '@alfalab/icons-glyph/ExclamationCircleMIcon';
import { CrossCircleMIcon } from '@alfalab/icons-glyph/CrossCircleMIcon';
import { InformationCircleMIcon } from '@alfalab/icons-glyph/InformationCircleMIcon';
import type { ApplicationState, DecisionOutcome, DecisionReason } from '../../api-server/credit/types';
import { clientStateLabels, outcomeLabels } from '../../api-server/credit/labels';
import wordmarkGraphite from '../assets/brand/wordmark-graphite.webp';
import wordmarkSilver from '../assets/brand/wordmark-silver.webp';
import markGraphite from '../assets/brand/mark-graphite.webp';
import markSilver from '../assets/brand/mark-silver.webp';
import heroMark from '../assets/brand/hero-mark.webp';

export type GlyphIcon = ComponentType<SVGProps<SVGSVGElement>>;
export const SYNTHETIC_LABEL = 'Синтетические демонстрационные данные';

/** Original «Опора» logo: 3D wordmark «опора.» or the «O.» sign, graphite on light and silver on dark surfaces. */
export function Logo({ variant = 'graphite', kind = 'wordmark', height = 28 }: { variant?: 'graphite' | 'silver'; kind?: 'wordmark' | 'mark'; height?: number }) {
  const src = kind === 'wordmark' ? (variant === 'graphite' ? wordmarkGraphite : wordmarkSilver) : (variant === 'graphite' ? markGraphite : markSilver);
  return <img className="op-logo" src={src} alt="Опора" height={height} style={{ height }} />;
}
/** The volumetric «O.» from the original logo, used as the 3D object of dark hero surfaces. */
export function HeroMark({ className = '' }: { className?: string }) {
  return <img className={`op-hero-mark ${className}`} src={heroMark} alt="" aria-hidden="true" />;
}

/** «ООО «Демо Хлебозавод»» → «Х»: the meaningful word, without legal form, quotes and the demo prefix. */
export const companyInitial = (name: string) =>
  (name.replace(/^(ООО|АО|ПАО|ИП)\s*/, '').replace(/[«»"]/g, '').replace(/^Демо\s+/, '').trim()[0] ?? '·').toUpperCase();

export function SyntheticBadge({ text = SYNTHETIC_LABEL }: { text?: string }) {
  return <span className="op-synthetic" role="note"><InformationCircleMIcon aria-hidden="true" />{text}</span>;
}

/** Alfa glyph inside an Alfa super-ellipse — the standard Alfa way to mark a section or a list item. */
export function IconTile({ icon: Icon, tone = 'neutral', size = 48 }: { icon: GlyphIcon; tone?: 'neutral' | 'accent' | 'positive' | 'attention' | 'negative' | 'inverted'; size?: 40 | 48 | 56 }) {
  return <span className="op-icon-tile" data-tone={tone}><SuperEllipse size={size}><Icon /></SuperEllipse></span>;
}

const percentFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
/** 19.5 → «19,5%». */
export const formatPercent = (value: number) => `${percentFormat.format(value)}%`;

/** Money through Alfa Amount (rubles; minor units are not shown). */
export function Money({ value, bold = false }: { value: number; bold?: boolean }) {
  return <Amount className="op-money" value={Math.round(value) * 100} minority={100} currency="RUB" view="default" bold={bold ? 'full' : 'none'} />;
}

type Pricing = { keyRate: number; productMargin: number; riskPremium: number };
/**
 * Rate and its composition as two separate typographic lines: «19,5% годовых» / «16% ключевая ставка + 3,5% маржа».
 * Real spaces and a separator keep the text readable when copied or read by a screen reader.
 */
export function Rate({ rate, pricing, perYear = true }: { rate: number; pricing?: Pricing; perYear?: boolean }) {
  return <span className="op-rate">
    <span className="op-rate-total"><strong>{formatPercent(rate)}</strong>{perYear ? ' годовых' : ''}</span>
    {pricing && <>{' '}<span className="op-rate-parts">{formatPercent(pricing.keyRate)} ключевая ставка + {formatPercent(pricing.productMargin)} маржа
      {pricing.riskPremium ? ` + ${formatPercent(pricing.riskPremium)} за риск` : ''}</span></>}
  </span>;
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

export function PageTitle({ title, subtitle, eyebrow, aside }: { title: string; subtitle?: ReactNode; eyebrow?: string; aside?: ReactNode }) {
  return <header className="op-page-header">
    <div>
      {eyebrow && <span className="op-eyebrow">{eyebrow}</span>}
      <Typography.TitleResponsive tag="h1" view="large" font="system" weight="bold">{title}</Typography.TitleResponsive>
      {subtitle && <p className="op-page-subtitle">{subtitle}</p>}
    </div>
    {aside}
  </header>;
}

export function Section({ title, aside, children, className = '', icon, description, id }: { title: string; aside?: ReactNode; children: ReactNode;
  className?: string; icon?: GlyphIcon; description?: ReactNode; id?: string }) {
  return <section className={`op-card ${className}`} id={id}>
    <header className="op-card-header">
      {icon && <IconTile icon={icon} size={40} />}
      <div className="op-card-heading">
        <Typography.Title tag="h2" view="xsmall" font="system" weight="bold">{title}</Typography.Title>
        {description && <p className="op-muted op-small">{description}</p>}
      </div>
      {aside && <div className="op-card-aside">{aside}</div>}
    </header>
    {children}
  </section>;
}

export function Facts({ items, inverted = false }: { items: [string, ReactNode][]; inverted?: boolean }) {
  return <dl className="op-facts" data-inverted={inverted || undefined}>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function ProgressBar({ value, label, view = 'positive' }: { value: number; label: string; view?: 'positive' | 'attention' }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return <div className="op-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
    <AlfaProgressBar value={percent} view={view} />
  </div>;
}

/** «Зачем банк спрашивает это?» — every questionnaire field explains how it is used. */
export function Why({ text }: { text: string }) {
  return <Tooltip content={<span className="op-why-text">{text}</span>} trigger="click" position="top">
    <button type="button" className="op-why" aria-label={`Зачем банк спрашивает: ${text}`}>?</button>
  </Tooltip>;
}

const reasonIcon: Record<DecisionReason['kind'], GlyphIcon> = { positive: CheckmarkCircleMIcon, warning: ExclamationCircleMIcon,
  negative: CrossCircleMIcon, info: InformationCircleMIcon };
export function ReasonList({ reasons }: { reasons: DecisionReason[] }) {
  return <ul className="op-reasons">{reasons.map((reason) => {
    const Icon = reasonIcon[reason.kind];
    return <li key={reason.code + reason.text} className={`op-reason-${reason.kind}`} data-kind={reason.kind}><Icon aria-hidden="true" /><span>{reason.text}</span></li>;
  })}</ul>;
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return <div role="alert" className="op-plate"><Plate view="negative" rounded title={error}
    buttons={onRetry ? <button type="button" className="op-link" onClick={onRetry}>Повторить</button> : undefined} /></div>;
}

/** Alfa Plate for neutral, positive and attention notes. */
export function Note({ view = 'common', title, children }: { view?: 'common' | 'positive' | 'attention' | 'negative'; title?: ReactNode; children?: ReactNode }) {
  return <div className="op-plate" role="status"><Plate view={view} rounded title={title}>{children}</Plate></div>;
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
