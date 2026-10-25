// Step 3 «Анкета»: only fields that matching, checks, scoring or the decision actually use, grouped and explained.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@alfalab/core-components-button';
import { Input } from '@alfalab/core-components-input';
import { Textarea } from '@alfalab/core-components-textarea';
import { Select } from '@alfalab/core-components-select';
import { RadioGroup } from '@alfalab/core-components-radio-group';
import { Radio } from '@alfalab/core-components-radio';
import { CircularProgressBar } from '@alfalab/core-components-circular-progress-bar';
import { OfficeMIcon } from '@alfalab/icons-glyph/OfficeMIcon';
import { ChartPieCoinsMIcon } from '@alfalab/icons-glyph/ChartPieCoinsMIcon';
import { ScalesMIcon } from '@alfalab/icons-glyph/ScalesMIcon';
import { ClockMIcon } from '@alfalab/icons-glyph/ClockMIcon';
import { CalculatorMIcon } from '@alfalab/icons-glyph/CalculatorMIcon';
import { DocumentLinesMIcon } from '@alfalab/icons-glyph/DocumentLinesMIcon';
import { CheckmarkCircleMIcon } from '@alfalab/icons-glyph/CheckmarkCircleMIcon';
import { ExclamationCircleMIcon } from '@alfalab/icons-glyph/ExclamationCircleMIcon';
import { ArrowRightMIcon } from '@alfalab/icons-glyph/ArrowRightMIcon';
import { creditApi, type ApplicationView } from './api';
import { CtaBar, ErrorNote, Facts, Money, Note, ProgressBar, Reveal, Section, SyntheticBadge, useCompact, Why } from './ui';
import { fieldIdOf, itemTitle, readinessSummary } from './readiness-view';
import { businessAgeMonths, errorMessage, formatAge, formatDate, formatRub, groupDigits, months, parseAmount } from './format';
import { navigate } from './routes';
import { documentLabels, purposeLabels } from '../../api-server/credit/labels';
import { MIN_DESCRIPTION_LENGTH, type ReadinessGroup } from '../../api-server/credit/readiness';
import { industries, industryOf } from '../../api-server/credit/industry';
import { demoDeclaredFinancials } from '../../api-server/credit/synthetic-data';
import type { CreditPurpose, DeclaredCreditHistory, DeclaredFinancials, DocumentType } from '../../api-server/credit/types';
import { parseOneCStatement, DEMO_1C_STATEMENT_RAW, type ParsedOneCStatement } from '../shared/one-c-parser';
import { OneCStatementViewer } from './OneCStatementViewer';

/** «Зачем банк спрашивает это?» — one explanation per questionnaire field. */
export const why = {
  revenue: 'Используется для оценки масштаба бизнеса и размера допустимой кредитной нагрузки',
  expenses: 'Вместе с выручкой показывает прибыль, из которой будет погашаться кредит',
  currentDebt: 'Используется для расчёта долговой нагрузки',
  activeLoans: 'Число действующих кредитов сверяется с бюро кредитных историй и учитывается моделью риска',
  overdue: 'История просрочек учитывается при оценке кредитного риска и сверяется с бюро',
  amount: 'Сумма определяет платёж, нагрузку на прибыль и подходящий продукт',
  term: 'От срока зависит ежемесячный платёж и переплата',
  description: 'Помогает убедиться, что цель соответствует продукту',
} as const;

const demoDescriptions: Record<CreditPurpose, string> = {
  WORKING_CAPITAL: 'Закупка сырья и материалов под подтверждённые заказы на ближайшие два квартала.',
  EQUIPMENT: 'Покупка производственного оборудования для увеличения объёма выпуска.',
  NEW_LOCATION: 'Открытие второй точки: ремонт помещения, оборудование и запуск продаж.',
  EXPANSION: 'Расширение действующего бизнеса: новые направления и найм сотрудников.',
  INVESTMENT_PROJECT: 'Инвестиционный проект с окупаемостью около двух лет.',
  REFINANCING: 'Рефинансирование действующих кредитов на более длительный срок.',
  YOUNG_BUSINESS: 'Пополнение склада и маркетинг для растущего интернет-магазина.',
  OTHER: 'Финансирование текущей деятельности бизнеса.',
};

async function extractedCharacters(file: File): Promise<number | null> {
  if (!/\.(txt|pdf|docx)$/i.test(file.name)) return null;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    const { readDocument } = await import('../shared/document-reader');
    const document = await readDocument(file, () => {}, controller.signal);
    return document.pages.reduce((sum, page) => sum + page.text.length, 0);
  } catch { return null; } finally { clearTimeout(timer); }
}

type Fields = { purpose: CreditPurpose | null; amount: string; term: string; description: string; revenue: string; expenses: string; debt: string;
  loans: string; overdue: 'yes' | 'no' | ''; overdueDays: string };
const fieldsOf = (view: ApplicationView): Fields => {
  const app = view.application, f = app.declaredFinancials, h = app.declaredCreditHistory;
  return { purpose: app.purpose, amount: groupDigits(app.requestedAmount), term: app.requestedTermMonths ? String(app.requestedTermMonths) : '',
    description: app.purposeDescription, revenue: groupDigits(f?.revenue), expenses: groupDigits(f?.expenses), debt: groupDigits(f?.currentDebt),
    loans: f?.activeLoans === undefined ? '' : String(f.activeLoans), overdue: h ? (h.hadOverdue12m ? 'yes' : 'no') : '',
    overdueDays: h?.hadOverdue12m ? String(h.maxOverdueDays) : '' };
};
const groupTitles: Record<ReadinessGroup, string> = { company: 'Компания', finance: 'Финансы', obligations: 'Обязательства', history: 'Кредитная история',
  financing: 'Параметры финансирования', documents: 'Документы' };

/** Field with «Зачем банк спрашивает это?» and an anchor for the readiness checklist. */
function Field({ why: text, id, children }: { why: string; id?: string; children: ReactNode }) {
  return <div className="op-field-why" id={id}>{children}<Why text={text} /></div>;
}

const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

/** Scrolls to the questionnaire field that fixes a readiness item and focuses its input. */
function focusField(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const input = element.querySelector<HTMLElement>('input:not([type="file"]):not([type="radio"]), textarea, button');
  setTimeout(() => input?.focus({ preventScroll: true }), 350);
}

export function FormStep({ view, onChange, onSubmit }: { view: ApplicationView; onChange: (view: ApplicationView) => void; onSubmit: () => void }) {
  const app = view.application, product = view.product, company = view.company;
  const [fields, setFields] = useState(() => fieldsOf(view));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  /** Set after an attempt to submit an incomplete questionnaire: every invalid field shows its error. */
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const touch = (name: string) => () => setTouched((prev) => prev.has(name) ? prev : new Set(prev).add(name));
  const versionRef = useRef(app.version);
  versionRef.current = app.version;
  const [parsed1C, setParsed1C] = useState<ParsedOneCStatement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handle1CFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || '');
      setParsed1C(parseOneCStatement(text));
    };
    reader.readAsText(file);
  };

  const handleApply1C = async () => {
    if (!parsed1C) return;
    const revenueStr = groupDigits(parsed1C.totalInflow);
    const expensesStr = groupDigits(parsed1C.totalOutflow);
    setFields((prev) => ({
      ...prev,
      revenue: revenueStr,
      expenses: expensesStr,
    }));
    await run('1c-statement', async () => {
      await creditApi.addDocument(app.id, {
        type: 'BANK_STATEMENT',
        fileName: '1C_выписка_клиент_банк.txt',
        mimeType: 'text/plain',
        sizeBytes: 15420,
        textCharacters: 4800,
      });
      return creditApi.update(app.id, {
        declaredFinancials: {
          revenue: parsed1C.totalInflow,
          expenses: parsed1C.totalOutflow,
          currentDebt: parseAmount(fields.debt) ?? 0,
        },
        version: versionRef.current,
      });
    });
    setParsed1C(null);
  };
  // Server responses are the source of truth for the form.
  useEffect(() => { setFields(fieldsOf(view)); }, [app.version]);

  const run = async (label: string, action: () => Promise<ApplicationView>) => {
    setBusy(label); setError('');
    try { const next = await action(); onChange(next); return next; } catch (e) { setError(errorMessage(e)); return null; } finally { setBusy(''); }
  };
  const declared = (): DeclaredFinancials | null => {
    const revenue = parseAmount(fields.revenue), expenses = parseAmount(fields.expenses), currentDebt = parseAmount(fields.debt);
    if (!revenue || expenses === null || currentDebt === null) return null;
    return fields.loans === '' ? { revenue, expenses, currentDebt } : { revenue, expenses, currentDebt, activeLoans: Number(fields.loans) };
  };
  const history = (): DeclaredCreditHistory | null => fields.overdue === 'no' ? { hadOverdue12m: false, maxOverdueDays: 0 }
    : fields.overdue === 'yes' && Number(fields.overdueDays) > 0 ? { hadOverdue12m: true, maxOverdueDays: Number(fields.overdueDays) } : null;
  /** Sends only changed, valid fields. */
  const pendingPatch = () => {
    const patch: Record<string, unknown> = {};
    const amount = parseAmount(fields.amount), term = Number(fields.term), financials = declared(), credit = history();
    if (fields.purpose && fields.purpose !== app.purpose) patch.purpose = fields.purpose;
    if (amount && amount !== app.requestedAmount) patch.requestedAmount = amount;
    if (term && term !== app.requestedTermMonths) patch.requestedTermMonths = term;
    if (fields.description !== app.purposeDescription) patch.purposeDescription = fields.description;
    if (financials && JSON.stringify(financials) !== JSON.stringify(app.declaredFinancials)) patch.declaredFinancials = financials;
    if (credit && JSON.stringify(credit) !== JSON.stringify(app.declaredCreditHistory)) patch.declaredCreditHistory = credit;
    return patch;
  };
  const save = async () => {
    const patch = pendingPatch();
    if (!Object.keys(patch).length) return view;
    return run('save', () => creditApi.update(app.id, { ...patch, version: versionRef.current }));
  };
  const attach = async (type: DocumentType, file?: File) => {
    const document = file
      ? { type, fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: Math.max(1, file.size), textCharacters: await extractedCharacters(file) }
      : { type, fileName: `demo-${type.toLowerCase().replace(/_/g, '-')}.pdf`, mimeType: 'application/pdf', sizeBytes: 184_320, textCharacters: 5200 };
    await run(`document:${type}`, () => creditApi.addDocument(app.id, document));
  };
  /** Demo helper: description and required documents; non-clients also get their synthetic figures. Never invents credit history. */
  const fillDemo = async () => {
    let current: ApplicationView | null = view;
    const patch: Record<string, unknown> = {};
    if (fields.description.trim().length < MIN_DESCRIPTION_LENGTH && app.purpose) patch.purposeDescription = demoDescriptions[app.purpose];
    const demo = demoDeclaredFinancials[company.inn];
    if (company.relationship === 'non_client' && demo && !app.declaredFinancials) patch.declaredFinancials = demo;
    if (Object.keys(patch).length) current = await run('demo', () => creditApi.update(app.id, { ...patch, version: versionRef.current }));
    const required = current?.readiness.items.filter((i) => i.required && i.code.startsWith('document:')).map((i) => i.code.slice(9) as DocumentType) ?? [];
    for (const type of required)
      if (current && !current.documents.some((d) => d.type === type)) current = await run('demo', () => creditApi.addDocument(app.id,
        { type, fileName: `demo-${type.toLowerCase().replace(/_/g, '-')}.pdf`, mimeType: 'application/pdf', sizeBytes: 184_320, textCharacters: 5200 }));
  };

  // ---- Field-level validation: the same rules as the server readiness, shown right at the field ----
  const amount = parseAmount(fields.amount), term = Number(fields.term), descriptionLength = fields.description.trim().length;
  const missingCodes = new Set(view.readiness.missing.map((m) => m.code));
  const requested = view.decision?.outcome === 'NEEDS_INFO' ? view.decision.requiredInfo : [];
  const show = (name: string) => attempted || touched.has(name);
  const errors: Record<string, string | undefined> = {
    description: descriptionLength > 0 && descriptionLength < MIN_DESCRIPTION_LENGTH
      ? `Опишите цель подробнее: нужно не меньше ${MIN_DESCRIPTION_LENGTH} символов, сейчас ${descriptionLength}.`
      : descriptionLength === 0 && (show('description') || missingCodes.has('purposeDescription') && attempted)
        ? `Опишите, на что пойдут деньги — хотя бы одно предложение (от ${MIN_DESCRIPTION_LENGTH} символов).` : undefined,
    amount: !amount ? (show('amount') ? 'Укажите сумму' : undefined)
      : product && (amount < product.minAmount || amount > product.maxAmount)
        ? `Для продукта «${product.name}» сумма — от ${formatRub(product.minAmount)} до ${formatRub(product.maxAmount)}` : undefined,
    term: !term ? (show('term') ? 'Укажите срок в месяцах' : undefined)
      : product && (term < product.minTermMonths || term > product.maxTermMonths)
        ? `Срок для этого продукта — от ${product.minTermMonths} до ${months(product.maxTermMonths)}` : undefined,
    purpose: product && fields.purpose && !product.purposes.includes(fields.purpose) ? 'Этот продукт не финансирует выбранную цель — выберите цель из списка или другой продукт' : undefined,
    revenue: !parseAmount(fields.revenue) && (missingCodes.has('declaredFinancials') || requested.some((r) => r.field === 'declaredFinancials')) && show('revenue')
      ? 'Укажите выручку за последний год — без неё банк не оценит платёжеспособность' : undefined,
    expenses: parseAmount(fields.expenses) === null && (missingCodes.has('declaredFinancials') || requested.some((r) => r.field === 'declaredFinancials')) && show('expenses')
      ? 'Укажите расходы за год — из них считается прибыль' : undefined,
    debt: parseAmount(fields.debt) === null && fields.revenue && show('debt') ? 'Укажите сумму кредитов, 0 — если их нет' : undefined,
    overdueDays: fields.overdue === 'yes' && !(Number(fields.overdueDays) > 0) ? 'Укажите самую длинную просрочку в днях' : undefined,
  };

  const needed = new Set<DocumentType>(view.readiness.items.filter((i) => i.required && i.code.startsWith('document:')).map((i) => i.code.slice(9) as DocumentType));
  for (const item of requested) if (item.documentType) needed.add(item.documentType);
  const optional = (['FINANCIAL_STATEMENT', ...(company.source === 'manual' ? ['REGISTRY_EXTRACT'] : [])] as DocumentType[]).filter((type) => !needed.has(type));
  const dirty = Object.keys(pendingPatch()).length > 0;
  const summary = readinessSummary(view.readiness, fields.description);
  const localErrors = Object.entries(errors).filter(([, message]) => message);
  const submit = async () => {
    const saved = await save();
    if (saved?.application.state === 'READY_TO_SUBMIT' && !localErrors.length) { onSubmit(); return; }
    // Explain instead of a silently disabled button: highlight every problem and go to the first one.
    setAttempted(true);
    const first = localErrors[0]?.[0] ?? (saved ? saved.readiness.missing[0]?.code : undefined);
    if (first) focusField(localErrors.length ? `field-${first}` : fieldIdOf(first));
  };
  const financials = declared();
  const age = businessAgeMonths(company.registrationDate, new Date());
  const money = (key: 'amount' | 'revenue' | 'expenses' | 'debt') => (_: unknown, { value }: { value: string }) => setFields({ ...fields, [key]: groupDigits(parseAmount(value)) });
  const source = company.relationship === 'client' ? 'Данные банка' : company.isSynthetic ? 'Синтетический реестр' : company.source === 'manual' ? 'Введено вами' : 'Реестр';
  const ready = summary.ready && !localErrors.length && !dirty;
  const compact = useCompact();
  const submitBlock = <>
    <Button view="accent" size={56} block className="op-submit" disabled={!!busy} loading={busy === 'save'} onClick={() => void submit()}
      rightAddons={<ArrowRightMIcon />}>Отправить на рассмотрение</Button>
    {!ready && attempted && localErrors.length + summary.missingRequired.length > 0 && <p className="op-field-error" role="alert">
      {localErrors.length ? `Исправьте ${localErrors.length} ${plural(localErrors.length, 'поле', 'поля', 'полей')} — они подсвечены в анкете.` : 'Заполните отмеченные пункты.'}</p>}
  </>;
  return <div className="op-workspace">
    <div className="op-workspace-main" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) void save(); }}>
      {requested.length > 0 && <Note view="attention" title={view.decision!.summary}>
        <ul className="op-plain">{requested.map((item) => <li key={item.code}>{item.text}</li>)}</ul>
        <p>{view.decision!.nextAction}</p>
      </Note>}
      {error && <ErrorNote error={error} />}
      <Section title="Компания" icon={OfficeMIcon} id="section-company" aside={<span className="op-source">{source}</span>}>
        {company.isSynthetic && <SyntheticBadge />}
        <Facts items={[['Название', company.name], ['ИНН', company.inn],
          ['Регистрация', `${formatDate(company.registrationDate)}${age !== null ? ` · ${formatAge(age)}` : ''}`],
          ['Отрасль', `${industries[industryOf(company.okved)].label} (ОКВЭД ${company.okved})`], ['Регион', company.region],
          ...(company.employees !== null ? [['Сотрудников', String(company.employees)]] as [string, string][] : [])]} />
        <p className="op-muted op-small">Срок работы, отрасль и регион используются в подборе продукта, скоринге и модели риска.</p>
      </Section>
      <Section title="Финансы за последний год" icon={ChartPieCoinsMIcon}
        aside={<div className="op-1c-toolbar">
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".txt,.csv" onChange={handle1CFile} />
          <Button view="secondary" size={32} onClick={() => fileInputRef.current?.click()}>Загрузить 1С</Button>
          <Button view="outlined" size={32} onClick={() => setParsed1C(parseOneCStatement(DEMO_1C_STATEMENT_RAW))}>Демо-выписка 1С</Button>
          {company.relationship === 'client' && app.declaredFinancials && <span className="op-source">подставлено по данным банка</span>}
        </div>}>
        {parsed1C && (
          <OneCStatementViewer
            statement={parsed1C}
            onApply={() => void handleApply1C()}
            onClose={() => setParsed1C(null)}
          />
        )}
        <div className="op-form-grid op-form-grid-3">
          <Field why={why.revenue} id="field-revenue"><Input label="Выручка, ₽" inputMode="numeric" block value={fields.revenue} onChange={money('revenue')}
            onBlur={touch('revenue')} error={errors.revenue} /></Field>
          <Field why={why.expenses} id="field-expenses"><Input label="Расходы, ₽" inputMode="numeric" block value={fields.expenses} onChange={money('expenses')}
            onBlur={touch('expenses')} error={errors.expenses} /></Field>
          <div className="op-computed" data-negative={financials ? financials.revenue - financials.expenses <= 0 : undefined}>
            <span className="op-muted op-small">Прибыль</span><strong>{financials ? <Money value={financials.revenue - financials.expenses} /> : '—'}</strong></div>
        </div>
      </Section>
      <Section title="Обязательства" icon={ScalesMIcon}>
        <div className="op-form-grid">
          <Field why={why.currentDebt} id="field-debt"><Input label="Текущие кредиты и займы, ₽" inputMode="numeric" block value={fields.debt} onChange={money('debt')}
            onBlur={touch('debt')} error={errors.debt} /></Field>
          <Field why={why.activeLoans} id="field-loans"><Input label="Количество действующих кредитов" inputMode="numeric" block value={fields.loans} maxLength={2}
            onChange={(_, { value }) => setFields({ ...fields, loans: value.replace(/\D/g, '') })} hint="Желательно: сверяется с бюро кредитных историй" /></Field>
        </div>
      </Section>
      <Section title="Кредитная история" icon={ClockMIcon}>
        <Field why={why.overdue} id="field-overdue">
          <RadioGroup label="Были ли просрочки по кредитам за последние 12 месяцев?" direction="horizontal" value={fields.overdue || undefined}
            onChange={(_, { value }) => setFields({ ...fields, overdue: value as 'yes' | 'no' })}>
            <Radio value="no" label="Нет" /><Radio value="yes" label="Да" />
          </RadioGroup>
        </Field>
        {fields.overdue === 'yes' && <div id="field-overdueDays"><Input label="Самая длинная просрочка, дней" inputMode="numeric" block value={fields.overdueDays} maxLength={4}
          onChange={(_, { value }) => setFields({ ...fields, overdueDays: value.replace(/\D/g, '') })} error={errors.overdueDays} /></div>}
        <p className="op-muted op-small">Ответ сверяется с бюро кредитных историй (в демо — синтетическим). Расхождение банк увидит в причинах решения.</p>
      </Section>
      <Section title="Параметры финансирования" icon={CalculatorMIcon}>
        <div className="op-form-grid">
          <div className="op-computed"><span className="op-muted op-small">Продукт</span><strong>{product?.name ?? 'Не выбран'}</strong>
            <button type="button" className="op-link" onClick={() => navigate({ name: 'application', id: app.id, stage: 'match' })}>Изменить</button></div>
          <div id="field-purpose"><Select label="Цель" block options={(product?.purposes ?? []).map((p) => ({ key: p, content: purposeLabels[p] }))} selected={fields.purpose ?? null}
            onChange={({ selected }) => setFields({ ...fields, purpose: (selected?.key ?? null) as CreditPurpose | null })} error={errors.purpose} /></div>
          <Field why={why.amount} id="field-amount"><Input label="Сумма, ₽" inputMode="numeric" block value={fields.amount} onChange={money('amount')} onBlur={touch('amount')}
            error={errors.amount} hint={product ? `${formatRub(product.minAmount)} – ${formatRub(product.maxAmount)}` : undefined} /></Field>
          <Field why={why.term} id="field-term"><Input label="Срок, мес." inputMode="numeric" block value={fields.term} maxLength={3} onBlur={touch('term')}
            onChange={(_, { value }) => setFields({ ...fields, term: value.replace(/\D/g, '') })} error={errors.term}
            hint={product ? `от ${product.minTermMonths} до ${months(product.maxTermMonths)}` : undefined} /></Field>
        </div>
        <Field why={why.description} id="field-description"><Textarea label="Описание цели финансирования" block minRows={3} maxLength={2000} value={fields.description}
          onChange={(_, { value }) => setFields({ ...fields, description: value })} onBlur={touch('description')} error={errors.description}
          hint={descriptionLength >= MIN_DESCRIPTION_LENGTH ? 'Достаточно подробно' : `Не короче ${MIN_DESCRIPTION_LENGTH} символов · сейчас ${descriptionLength}`} /></Field>
      </Section>
      <Section title="Документы" icon={DocumentLinesMIcon} description="Файлы читаются в браузере — на сервер уходят только название и размер">
        <ul className="op-documents">
          {[...needed, ...optional].map((type) => {
            const uploaded = view.documents.filter((d) => d.type === type);
            const missing = needed.has(type) && !uploaded.length;
            return <li key={type} id={`doc-${type}`} data-done={uploaded.length > 0} data-missing={missing && attempted ? true : undefined}>
              {uploaded.length ? <CheckmarkCircleMIcon className="op-doc-icon" data-ok="true" aria-hidden="true" />
                : <DocumentLinesMIcon className="op-doc-icon" aria-hidden="true" />}
              <div>
                <strong>{documentLabels[type]}</strong>
                <span className="op-muted">{needed.has(type) ? 'Обязательный' : 'Желательный'}{uploaded.length ? ` · ${uploaded.map((d) => d.fileName).join(', ')}` : ''}</span>
                {missing && attempted && <span className="op-field-error">Приложите файл — без него заявку не отправить</span>}
              </div>
              <div className="op-document-actions">
                <label className="op-file-button">{uploaded.length ? 'Заменить' : 'Загрузить файл'}
                  <input type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" disabled={!!busy}
                    onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void attach(type, file); }} />
                </label>
                {!uploaded.length && <button type="button" className="op-link" disabled={!!busy} onClick={() => void attach(type)}>Демо-файл</button>}
              </div>
            </li>;
          })}
        </ul>
      </Section>
    </div>
    <aside className="op-workspace-side">
      <section className="op-card op-readiness" data-ready={summary.ready} aria-live="polite">
        <header className="op-readiness-head">
          <CircularProgressBar value={Math.round(summary.requiredDone / Math.max(1, summary.requiredTotal) * 100)} size={compact ? 64 : 80}
            view="positive" title={`${summary.requiredDone}/${summary.requiredTotal}`} />
          <div>
            <h2>{summary.headline}</h2>
            <p>{summary.detail}</p>
          </div>
        </header>
        {summary.missingRequired.length > 0 && <ul className="op-todo" aria-label="Не заполнено">{summary.missingRequired.map((item) =>
          <li key={item.code}><button type="button" onClick={() => { setAttempted(true); focusField(fieldIdOf(item.code)); }}>
            <ExclamationCircleMIcon aria-hidden="true" /><span>{itemTitle(item, fields.description).replace(/^./, (c) => c.toUpperCase())}</span><ArrowRightMIcon aria-hidden="true" />
          </button></li>)}</ul>}
        <Reveal summary={`Полнота анкеты ${Math.round(view.readiness.completeness * 100)}% · подробнее`}>
        {summary.missingOptional.length > 0 && <div className="op-optional">
          <span className="op-muted op-small">Желательно — повысит полноту и оценку:</span>
          <ul className="op-todo op-todo-optional">{summary.missingOptional.map((item) =>
            <li key={item.code}><button type="button" onClick={() => focusField(fieldIdOf(item.code))}>
              <span>{itemTitle(item).replace(/^./, (c) => c.toUpperCase())}</span><ArrowRightMIcon aria-hidden="true" /></button></li>)}</ul>
        </div>}
        <div className="op-completeness">
          <div className="op-row"><span className="op-small">Полнота анкеты для оценки</span><strong>{Math.round(view.readiness.completeness * 100)}%</strong></div>
          <ProgressBar value={view.readiness.completeness} label="Полнота анкеты" view={summary.ready ? 'positive' : 'attention'} />
          <span className="op-muted op-small">Учитывает и желательные пункты: {summary.optionalDone} из {summary.optionalTotal} заполнено. Отправить можно, когда заполнены все обязательные.</span>
        </div>
        <details className="op-details">
          <summary>Все пункты по группам</summary>
          <ul className="op-checklist">{(Object.keys(groupTitles) as ReadinessGroup[]).map((group) => {
            const items = view.readiness.items.filter((i) => i.group === group);
            if (!items.length) return null;
            return <li key={group}>
              <strong>{groupTitles[group]}</strong>
              <ul>{items.map((item) => <li key={item.code} data-done={item.done} data-required={item.required}>
                <span aria-hidden="true">{item.done ? '✓' : item.required ? '•' : '○'}</span><span>{item.label}{!item.required && !item.done && <small> (желательно)</small>}</span>
              </li>)}</ul>
            </li>;
          })}</ul>
        </details>
        </Reveal>
        {company.isSynthetic && <button type="button" className="op-link" disabled={!!busy} onClick={() => void fillDemo()}>Заполнить демо-данными</button>}
        {!compact && submitBlock}
        {app.state === 'NEEDS_INFO' && <p className="op-muted op-small">Дополните анкету по списку в начале страницы — после этого её можно отправить снова.</p>}
      </section>
    </aside>
    {compact && <CtaBar>{submitBlock}</CtaBar>}
  </div>;
}
