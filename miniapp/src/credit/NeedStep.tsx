// Step 1 «Потребность»: company, purpose, amount, term and the business task. The application is created here.
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@alfalab/core-components-button';
import { Input } from '@alfalab/core-components-input';
import { Textarea } from '@alfalab/core-components-textarea';
import { Select } from '@alfalab/core-components-select';
import { RadioGroup } from '@alfalab/core-components-radio-group';
import { Tag } from '@alfalab/core-components-tag';
import { purposeIcons } from './purpose-icons';
import { MagicWandMIcon } from '@alfalab/icons-glyph/MagicWandMIcon';
import { ArrowRightMIcon } from '@alfalab/icons-glyph/ArrowRightMIcon';
import { CalculatorMIcon } from '@alfalab/icons-glyph/CalculatorMIcon';
import { ChartPieCoinsMIcon } from '@alfalab/icons-glyph/ChartPieCoinsMIcon';
import { creditApi, type ApplicationView } from './api';
import { CtaBar, ErrorNote, FlowSteps, formatPercent, Money, Note, PageTitle, Section, SyntheticBadge, useCompact, Why } from './ui';
import { errorMessage, groupDigits, monthlyPayment, months, parseAmount } from './format';
import type { ProductMatch } from '../../api-server/credit/matching';
import { navigate } from './routes';
import type { DemoSession } from './session';
import { purposeLabels } from '../../api-server/credit/labels';
import { demoDeclaredFinancials } from '../../api-server/credit/synthetic-data';
import { creditPurposes, type CreditPurpose, type DeclaredFinancials } from '../../api-server/credit/types';

const termOptions = [3, 6, 9, 12, 18, 24, 36, 48, 60].map((t) => ({ key: String(t), content: months(t) }));
export type NeedValues = { purpose: CreditPurpose | null; amount: string; term: string; description: string;
  revenue: string; expenses: string; debt: string };

/** New application from the current demo company. */
export function NeedStep({ session }: { session: DemoSession }) {
  const company = session.company;
  const demo = company.demo;
  const [error, setError] = useState('');
  const initial: NeedValues = { purpose: demo?.need.purpose ?? null, amount: groupDigits(demo?.need.requestedAmount), term: String(demo?.need.requestedTermMonths ?? 12),
    description: '', revenue: '', expenses: '', debt: '' };
  const submit = async (values: NeedValues, declared: DeclaredFinancials | null) => {
    setError('');
    try {
      const view = await creditApi.create({ companyInn: company.inn, ...(session.manual ? { company: session.manual } : {}),
        purpose: values.purpose!, requestedAmount: parseAmount(values.amount)!, requestedTermMonths: Number(values.term),
        purposeDescription: values.description, ...(declared ? { declaredFinancials: declared } : {}) });
      navigate({ name: 'application', id: view.application.id, stage: 'match' });
    } catch (e) { setError(errorMessage(e)); }
  };
  return <div className="op-page op-flow-page">
    <nav className="op-breadcrumbs"><a href="#/">Кабинет</a><span>Новое финансирование</span></nav>
    <PageTitle eyebrow={company.name} title="Новое финансирование" subtitle="Начнём с задачи бизнеса — продукт подберём сами." back="#/" />
    <FlowSteps current={0} />
    <NeedForm initial={initial} nonClient={session.relationship === 'non_client'} demoInn={company.isSynthetic ? company.inn : null}
      companyName={company.name} preview={{ inn: session.manual ? undefined : company.inn, registrationDate: company.registrationDate }}
      submitLabel="Подобрать финансирование" onSubmit={submit} error={error} />
  </div>;
}

/** Editing the need of an existing application (step 1 revisited). */
export function NeedEdit({ view, onChange }: { view: ApplicationView; onChange: (view: ApplicationView) => void }) {
  const app = view.application, f = app.declaredFinancials;
  const [error, setError] = useState('');
  const editable = view.status.editable;
  const initial: NeedValues = { purpose: app.purpose, amount: groupDigits(app.requestedAmount), term: String(app.requestedTermMonths ?? 12),
    description: app.purposeDescription, revenue: groupDigits(f?.revenue), expenses: groupDigits(f?.expenses), debt: groupDigits(f?.currentDebt) };
  const submit = async (values: NeedValues, declared: DeclaredFinancials | null) => {
    setError('');
    try {
      onChange(await creditApi.update(app.id, { purpose: values.purpose!, requestedAmount: parseAmount(values.amount)!, requestedTermMonths: Number(values.term),
        purposeDescription: values.description, ...(declared ? { declaredFinancials: { ...declared, ...(f?.activeLoans !== undefined ? { activeLoans: f.activeLoans } : {}) } } : {}),
        version: app.version }));
      navigate({ name: 'application', id: app.id, stage: 'match' });
    } catch (e) { setError(errorMessage(e)); }
  };
  if (!editable) return <Section title="Потребность"><p className="op-muted">Заявка уже отправлена — параметры потребности зафиксированы.</p></Section>;
  return <NeedForm initial={initial} nonClient={view.company.relationship === 'non_client'} demoInn={view.company.isSynthetic ? view.company.inn : null}
    companyName={view.company.name} preview={{ inn: view.company.inn, registrationDate: view.company.registrationDate }}
    submitLabel="Сохранить и подобрать" onSubmit={submit} error={error} />;
}

const examples = [
  'Хочу открыть вторую кофейню, купить оборудование и сделать ремонт. Нужно около 4 млн рублей',
  'Нужно 3 млн на закупку сырья под заказы, вернём за год',
  'Хотим рефинансировать два кредита на 6 млн на срок побольше',
];

type Preview = { inn?: string; registrationDate: string | null };
/** Live indicative offer from the real catalog while the need is typed. Not a decision, nothing is stored. */
function useIndicative(preview: Preview, purpose: CreditPurpose | null, amount: number | null, term: number) {
  const [match, setMatch] = useState<{ best: ProductMatch | null; eligible: number } | null>(null);
  useEffect(() => {
    if (!purpose || !amount || amount < 10_000 || !term) { setMatch(null); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => creditApi.products({ inn: preview.inn, registrationDate: preview.inn ? undefined : preview.registrationDate, purpose, amount, term }, controller.signal)
      .then(({ matches }) => {
        const eligible = matches.filter((m) => m.eligible);
        setMatch({ best: eligible.sort((a, b) => a.pricing.rate - b.pricing.rate)[0] ?? null, eligible: eligible.length });
      }).catch(() => {}), 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [preview.inn, preview.registrationDate, purpose, amount, term]);
  return match;
}

function NeedForm({ initial, nonClient, demoInn, companyName, preview, submitLabel, onSubmit, error }: {
  initial: NeedValues; nonClient: boolean; demoInn: string | null; companyName: string; preview: Preview; submitLabel: string; error: string;
  onSubmit: (values: NeedValues, declared: DeclaredFinancials | null) => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState('');
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [problem, setProblem] = useState('');
  const set = (key: keyof NeedValues) => (_: unknown, { value }: { value: string }) => setValues({ ...values, [key]: value });
  const money = (key: 'amount' | 'revenue' | 'expenses' | 'debt') => (_: unknown, { value }: { value: string }) => setValues({ ...values, [key]: groupDigits(parseAmount(value)) });
  const amount = parseAmount(values.amount), term = Number(values.term);
  const indicative = useIndicative(preview, values.purpose, amount, term);
  const parse = async () => {
    setParsing(true); setParsed(''); setProblem('');
    try {
      const need = await creditApi.parseNeed(text);
      setValues({ ...values, purpose: need.purpose, amount: need.amount ? groupDigits(need.amount) : values.amount, term: String(need.suggestedTerm),
        description: values.description || need.businessGoal });
      setParsed(`${need.source === 'llm' ? 'AI-ассистент' : 'Распознано по правилам'}: ${need.financingCategory.toLowerCase()}, «${purposeLabels[need.purpose]}»`
        + `${need.amount ? `, ${groupDigits(need.amount)} ₽` : ''}, срок ${months(need.suggestedTerm)}. Проверьте поля ниже.`);
    } catch (e) { setProblem(errorMessage(e)); } finally { setParsing(false); }
  };
  const fillDemo = () => {
    const d = demoInn ? demoDeclaredFinancials[demoInn] : null;
    if (d) setValues({ ...values, revenue: groupDigits(d.revenue), expenses: groupDigits(d.expenses), debt: groupDigits(d.currentDebt) });
  };
  const amountError = values.amount && (!amount || amount < 100_000 || amount > 100_000_000) ? 'Сумма — от 100 000 до 100 000 000 ₽' : undefined;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setProblem('');
    if (!values.purpose) { setProblem('Выберите, на что нужны деньги.'); return; }
    if (!amount || amount < 100_000 || amount > 100_000_000) { setProblem('Укажите сумму от 100 000 до 100 000 000 ₽.'); return; }
    const revenue = parseAmount(values.revenue), expenses = parseAmount(values.expenses), debt = parseAmount(values.debt);
    const declared = revenue && expenses !== null ? { revenue, expenses, currentDebt: debt ?? 0 } : null;
    setBusy(true);
    try { await onSubmit(values, declared); } finally { setBusy(false); }
  };
  const best = indicative?.best;
  const payment = best && amount ? monthlyPayment(amount, best.pricing.rate, term) : null;
  const compact = useCompact();
  const cta = <Button view="accent" size={56} block type="submit" loading={busy} disabled={parsing} rightAddons={<ArrowRightMIcon />}>{submitLabel}</Button>;
  return <form className="op-need" onSubmit={submit}>
    <div className="op-need-main">
      <section className="op-card op-ask">
        <div className="op-ask-head">
          <span className="op-eyebrow">Шаг 1 · Потребность</span>
          <h2>Что нужно вашему бизнесу?</h2>
          <p className="op-muted">Опишите задачу своими словами — мы поймём цель, сумму и срок. {companyName}</p>
        </div>
        <Textarea label="Например: «Хочу открыть вторую кофейню, купить оборудование и сделать ремонт. Нужно около 4 млн рублей»" block minRows={3}
          maxLength={1000} value={text} onChange={(_, { value }) => setText(value)} />
        <div className="op-ask-actions">
          <Button view="primary" size={48} disabled={text.trim().length < 3 || busy} loading={parsing} leftAddons={<MagicWandMIcon />}
            onClick={() => void parse()}>Разобрать описание</Button>
          <div className="op-chips" aria-label="Примеры">{examples.map((example) =>
            <button key={example} type="button" className="op-chip" onClick={() => setText(example)}>{example.split(/[.,]/)[0]}</button>)}</div>
        </div>
        {parsed && <Note view="positive" title={parsed} />}
      </section>
      <Section title="На что нужны деньги" description="Цель определяет подходящие продукты и документы">
        <RadioGroup type="tag" direction="horizontal" value={values.purpose ?? undefined} className="op-purposes"
          onChange={(_, { value }) => setValues({ ...values, purpose: value as CreditPurpose })}>
          {creditPurposes.map((purpose) => {
            const Icon = purposeIcons[purpose];
            return <Tag key={purpose} value={purpose} size={48} leftAddons={<Icon />}>{purposeLabels[purpose]}</Tag>;
          })}
        </RadioGroup>
        <div className="op-form-grid">
          <Input label="Сумма, ₽" inputMode="numeric" block size={56} value={values.amount} onChange={money('amount')} error={amountError} />
          <Select label="Желаемый срок" block size={56} options={termOptions} selected={values.term} onChange={({ selected }) => setValues({ ...values, term: selected?.key ?? '12' })} />
        </div>
        <Textarea label="Какую задачу бизнеса решаете" block minRows={2} maxLength={2000} value={values.description} onChange={set('description')}
          hint="Например: вторая точка в спальном районе, окупаемость 2 года" />
      </Section>
      {nonClient && <Section title="Ключевые показатели для подбора" icon={ChartPieCoinsMIcon}
        description="Банк пока не видит обороты вашей компании. Укажите показатели за последний год — подбор сразу учтёт нагрузку."
        aside={demoInn && demoDeclaredFinancials[demoInn]
          ? <><SyntheticBadge text="Демо-значения" /><button type="button" className="op-link" onClick={fillDemo}>Заполнить демо-данными</button></> : undefined}>
        <div className="op-form-grid op-form-grid-3">
          <div className="op-field-why"><Input label="Выручка за год, ₽" inputMode="numeric" block value={values.revenue} onChange={money('revenue')} />
            <Why text="Используется для оценки масштаба бизнеса и размера допустимой кредитной нагрузки" /></div>
          <div className="op-field-why"><Input label="Расходы за год, ₽" inputMode="numeric" block value={values.expenses} onChange={money('expenses')} />
            <Why text="Вместе с выручкой показывает прибыль, из которой будет погашаться кредит" /></div>
          <div className="op-field-why"><Input label="Текущие кредиты и займы, ₽" inputMode="numeric" block value={values.debt} onChange={money('debt')} />
            <Why text="Используется для расчёта долговой нагрузки" /></div>
        </div>
      </Section>}
    </div>
    <aside className="op-need-side">
      <div className="op-preview" aria-live="polite">
        <span className="op-preview-label"><CalculatorMIcon aria-hidden="true" />Ориентировочно</span>
        {values.purpose && amount ? <>
          <span className="op-preview-purpose">{purposeLabels[values.purpose]}</span>
          <strong className="op-preview-amount"><Money value={amount} /></strong>
          <span className="op-preview-term">на {months(term)}</span>
          {best && payment ? <dl className="op-preview-facts">
            <div><dt>Платёж в месяц</dt><dd>≈ <Money value={payment} /></dd></div>
            <div><dt>Ставка от</dt><dd>{formatPercent(best.pricing.rate)}</dd></div>
            <div><dt>Подходит продуктов</dt><dd>{indicative!.eligible} из 6</dd></div>
          </dl> : <p className="op-preview-empty">{indicative && !best ? 'С такими параметрами продуктов нет — измените сумму или срок.' : 'Считаем…'}</p>}
          <small>Точные условия — после подбора и анкеты. Это не решение банка.</small>
        </> : <p className="op-preview-empty">Опишите задачу или выберите цель и сумму — здесь появится ориентировочный платёж.</p>}
      </div>
      {(problem || error) && <ErrorNote error={problem || error} />}
      {!compact && cta}
    </aside>
    {compact && <CtaBar>{cta}</CtaBar>}
  </form>;
}
