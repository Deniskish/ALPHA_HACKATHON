// Step 1 «Потребность»: company, purpose, amount, term and the business task. The application is created here.
import { useState, type FormEvent } from 'react';
import { Button } from '@alfalab/core-components-button';
import { Input } from '@alfalab/core-components-input';
import { Textarea } from '@alfalab/core-components-textarea';
import { Select } from '@alfalab/core-components-select';
import { RadioGroup } from '@alfalab/core-components-radio-group';
import { Tag } from '@alfalab/core-components-tag';
import { creditApi, type ApplicationView } from './api';
import { FlowSteps, Section, SyntheticBadge, Why } from './ui';
import { errorMessage, groupDigits, months, parseAmount } from './format';
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
  return <div className="op-page">
    <nav className="op-breadcrumbs"><a href="#/">Кабинет</a><span>Новое финансирование</span></nav>
    <h1>Новое финансирование</h1>
    <FlowSteps current={0} />
    <NeedForm initial={initial} nonClient={session.relationship === 'non_client'} demoInn={company.isSynthetic ? company.inn : null}
      companyName={company.name} submitLabel="Подобрать финансирование" onSubmit={submit} error={error} />
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
    companyName={view.company.name} submitLabel="Сохранить и подобрать" onSubmit={submit} error={error} />;
}

function NeedForm({ initial, nonClient, demoInn, companyName, submitLabel, onSubmit, error }: {
  initial: NeedValues; nonClient: boolean; demoInn: string | null; companyName: string; submitLabel: string; error: string;
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
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setProblem('');
    const amount = parseAmount(values.amount);
    if (!values.purpose) { setProblem('Выберите, на что нужны деньги.'); return; }
    if (!amount || amount < 100_000 || amount > 100_000_000) { setProblem('Укажите сумму от 100 000 до 100 000 000 ₽.'); return; }
    const revenue = parseAmount(values.revenue), expenses = parseAmount(values.expenses), debt = parseAmount(values.debt);
    const declared = revenue && expenses !== null ? { revenue, expenses, currentDebt: debt ?? 0 } : null;
    setBusy(true);
    try { await onSubmit(values, declared); } finally { setBusy(false); }
  };
  return <form className="op-need" onSubmit={submit}>
    <Section title="Опишите задачу своими словами" aside={<span className="op-muted">{companyName}</span>}>
      <Textarea label="Например: «Хочу открыть вторую кофейню, купить оборудование и сделать ремонт. Нужно около 4 млн рублей»" block minRows={3}
        maxLength={1000} value={text} onChange={(_, { value }) => setText(value)} />
      <div className="op-row">
        <Button view="secondary" size={40} disabled={text.trim().length < 3 || busy} loading={parsing} onClick={() => void parse()}>Разобрать описание</Button>
        <span className="op-muted">Можно сразу заполнить поля ниже</span>
      </div>
      {parsed && <p className="op-alert op-alert-info" role="status">{parsed}</p>}
    </Section>
    <Section title="Потребность в финансировании">
      <RadioGroup label="На что нужны деньги" type="tag" direction="horizontal" value={values.purpose ?? undefined}
        onChange={(_, { value }) => setValues({ ...values, purpose: value as CreditPurpose })}>
        {creditPurposes.map((purpose) => <Tag key={purpose} value={purpose} size={40}>{purposeLabels[purpose]}</Tag>)}
      </RadioGroup>
      <div className="op-form-grid">
        <Input label="Сумма, ₽" inputMode="numeric" block value={values.amount} onChange={money('amount')} />
        <Select label="Желаемый срок" block options={termOptions} selected={values.term} onChange={({ selected }) => setValues({ ...values, term: selected?.key ?? '12' })} />
      </div>
      <Textarea label="Какую задачу бизнеса решаете" block minRows={2} maxLength={2000} value={values.description} onChange={set('description')}
        hint="Например: вторая точка в спальном районе, окупаемость 2 года" />
    </Section>
    {nonClient && <Section title="Ключевые показатели для подбора" aside={demoInn && demoDeclaredFinancials[demoInn]
      ? <><SyntheticBadge text="Демо-значения" /><button type="button" className="op-link" onClick={fillDemo}>Заполнить демо-данными</button></> : undefined}>
      <p className="op-muted">Банк пока не видит обороты вашей компании. Укажите показатели за последний год — подбор будет точнее. Их можно уточнить в анкете.</p>
      <div className="op-form-grid">
        <label className="op-field-why"><Input label="Выручка за год, ₽" inputMode="numeric" block value={values.revenue} onChange={money('revenue')} />
          <Why text="Используется для оценки масштаба бизнеса и размера допустимой кредитной нагрузки" /></label>
        <label className="op-field-why"><Input label="Расходы за год, ₽" inputMode="numeric" block value={values.expenses} onChange={money('expenses')} />
          <Why text="Вместе с выручкой показывает прибыль, из которой будет погашаться кредит" /></label>
        <label className="op-field-why"><Input label="Текущие кредиты и займы, ₽" inputMode="numeric" block value={values.debt} onChange={money('debt')} />
          <Why text="Используется для расчёта долговой нагрузки" /></label>
      </div>
    </Section>}
    {(problem || error) && <p className="op-alert op-alert-danger" role="alert">{problem || error}</p>}
    <div className="op-actions"><Button view="accent" size={56} type="submit" loading={busy} disabled={parsing}>{submitLabel}</Button></div>
  </form>;
}
