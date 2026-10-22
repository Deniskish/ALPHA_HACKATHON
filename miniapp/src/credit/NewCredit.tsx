// New credit wizard: company → business profile → financing need → matching products.
// Nothing is stored on the server until a product is chosen; then the application is created via the API.
import { useEffect, useState, type FormEvent } from 'react';
import { creditApi, type CompanyView, type ManualCompany } from './api';
import { ErrorNote, FlowSteps, Loading, Section, SyntheticBadge } from './ui';
import { businessAgeMonths, errorMessage, formatAge, formatDate, formatRub, groupDigits, months, parseAmount } from './format';
import { navigate } from './routes';
import { ActionButton, BusinessInput } from '../shared/Controls';
import { validInn } from '../../api-server/company-data/inn';
import { purposeLabels } from '../../api-server/credit/labels';
import type { ProductMatch } from '../../api-server/credit/matching';
import { creditPurposes, type CreditPurpose, type FinancingNeed } from '../../api-server/credit/types';

type Step = 'company' | 'need' | 'products';
type Draft = { step: Step; company: CompanyView | null; manual: ManualCompany | null; need: Partial<FinancingNeed> };
const storageKey = 'credit.new-draft.v1';
const emptyDraft: Draft = { step: 'company', company: null, manual: null, need: {} };
const scenarioLetter: Record<string, string> = { APPROVED: 'A', COUNTER_OFFER: 'B', NEEDS_INFO: 'C', REJECTED: 'D' };

function loadDraft(): Draft {
  try { return { ...emptyDraft, ...JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') }; } catch { return emptyDraft; }
}

export function NewCredit() {
  const [draft, setDraftState] = useState<Draft>(loadDraft);
  const setDraft = (next: Draft) => {
    setDraftState(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* The wizard still works without storage. */ }
  };
  const company = draft.company;
  return <div className="cc-page">
    <nav className="cc-breadcrumbs"><a href="#/">Главная</a><span>Новый кредит</span></nav>
    <h1>Новый кредит</h1>
    <FlowSteps current={draft.step === 'company' ? 0 : draft.step === 'need' ? 1 : 2} />
    {draft.step === 'company' && <CompanyStep onSelect={(selected, manual) => setDraft({ step: 'need', company: selected, manual,
      need: selected.demo ? selected.demo.need : {} })} />}
    {draft.step !== 'company' && company && <CompanyProfile company={company} onChange={() => setDraft(emptyDraft)} />}
    {draft.step === 'need' && company && <FinancingNeedStep company={company} need={draft.need}
      onSubmit={(need) => setDraft({ ...draft, step: 'products', need })} />}
    {draft.step === 'products' && company && <CreditProducts company={company} manual={draft.manual} need={draft.need as FinancingNeed}
      onBack={() => setDraft({ ...draft, step: 'need' })} onCreated={(id) => { setDraft(emptyDraft); navigate({ name: 'application', id }); }} />}
  </div>;
}

function CompanyStep({ onSelect }: { onSelect: (company: CompanyView, manual: ManualCompany | null) => void }) {
  const [companies, setCompanies] = useState<CompanyView[] | null>(null);
  const [error, setError] = useState('');
  const [inn, setInn] = useState('');
  const [lookup, setLookup] = useState<{ busy: boolean; error: string; manual: boolean }>({ busy: false, error: '', manual: false });
  useEffect(() => {
    const controller = new AbortController();
    creditApi.demoCompanies(controller.signal).then((data) => setCompanies(data.companies))
      .catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
    return () => controller.abort();
  }, []);
  const find = async (event: FormEvent) => {
    event.preventDefault();
    if (!validInn(inn)) { setLookup({ busy: false, error: 'Проверьте ИНН: нужны 10 или 12 цифр с верной контрольной суммой.', manual: false }); return; }
    setLookup({ busy: true, error: '', manual: false });
    try { onSelect((await creditApi.company(inn)).company, null); }
    catch (e) {
      const notFound = (e as { status?: number }).status === 404;
      setLookup({ busy: false, manual: notFound, error: notFound ? 'Компания не найдена в подключённых источниках. Заполните сведения вручную.' : errorMessage(e) });
    }
  };
  return <>
    <Section title="Демо-компании" aside={<SyntheticBadge />}>
      <p className="cc-muted">Каждая компания воспроизводит отдельный сценарий решения. Все сведения о них вымышлены.</p>
      {error && <ErrorNote error={error} />}
      {!companies && !error && <Loading text="Загружаем демо-компании…" />}
      <div className="cc-demo-grid">{companies?.map((company) => <article key={company.inn} className="cc-demo-company" data-scenario={company.demo?.scenario}>
        <span className="cc-demo-scenario">{company.demo ? `Сценарий ${scenarioLetter[company.demo.scenario]}` : ''}</span>
        <h3>{company.name}</h3>
        <p className="cc-muted">ИНН {company.inn} · {company.region}</p>
        <p>{company.okvedTitle}</p>
        {company.demo && <p className="cc-demo-description">{company.demo.description}</p>}
        <ActionButton className="secondary" aria-label={`Выбрать ${company.name}`} onClick={() => onSelect(company, null)}>Выбрать</ActionButton>
      </article>)}</div>
    </Section>
    <Section title="Или найдите компанию по ИНН">
      <form className="cc-inline-form" onSubmit={find}>
        <label className="cc-field">ИНН компании или ИП
          <BusinessInput inputMode="numeric" maxLength={12} placeholder="10 или 12 цифр" value={inn}
            onChange={(e) => setInn(e.target.value.replace(/\D/g, ''))} />
        </label>
        <ActionButton className="primary" type="submit" disabled={lookup.busy}>{lookup.busy ? 'Ищем…' : 'Найти'}</ActionButton>
      </form>
      {lookup.error && <p className={lookup.manual ? 'cc-alert cc-alert-info' : 'cc-alert cc-alert-danger'} role="status">{lookup.error}</p>}
      {lookup.manual && <ManualCompanyForm inn={inn} onSubmit={(manual) => onSelect({ ...manual, employees: manual.employees ?? null, okvedTitle: null,
        financials: null, source: 'manual', isSynthetic: false, demo: null, updatedAt: new Date().toISOString(), syntheticLabel: null }, manual)} />}
    </Section>
  </>;
}

function ManualCompanyForm({ inn, onSubmit }: { inn: string; onSubmit: (company: ManualCompany) => void }) {
  const [form, setForm] = useState({ name: '', legalForm: inn.length === 12 ? 'ИП' : 'ООО', registrationDate: '', okved: '', region: '', employees: '' });
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.name.trim().length < 2 || form.region.trim().length < 2) { setError('Укажите название и регион.'); return; }
    if (!/^\d{2}(\.\d{1,2}){0,2}$/.test(form.okved)) { setError('ОКВЭД в формате 62.01.'); return; }
    if (!form.registrationDate || businessAgeMonths(form.registrationDate, new Date()) === null) { setError('Укажите дату регистрации, не позже сегодняшнего дня.'); return; }
    onSubmit({ inn, name: form.name.trim(), legalForm: form.legalForm as ManualCompany['legalForm'], registrationDate: form.registrationDate,
      okved: form.okved, region: form.region.trim(), employees: form.employees ? Number(form.employees) : null });
  };
  return <form className="cc-form-grid" onSubmit={submit} aria-label="Сведения о компании">
    <label className="cc-field">Название<BusinessInput value={form.name} onChange={set('name')} maxLength={160} placeholder="ООО «Ваша компания»" /></label>
    <label className="cc-field">Форма
      <select value={form.legalForm} onChange={set('legalForm')}>{['ООО', 'АО', 'ИП', 'другое'].map((v) => <option key={v}>{v}</option>)}</select>
    </label>
    <label className="cc-field">Дата регистрации<BusinessInput type="date" value={form.registrationDate} onChange={set('registrationDate')} /></label>
    <label className="cc-field">Основной ОКВЭД<BusinessInput value={form.okved} onChange={set('okved')} placeholder="62.01" maxLength={8} /></label>
    <label className="cc-field">Регион<BusinessInput value={form.region} onChange={set('region')} maxLength={100} placeholder="Москва" /></label>
    <label className="cc-field">Сотрудников<BusinessInput inputMode="numeric" value={form.employees} onChange={(e) => setForm({ ...form, employees: e.target.value.replace(/\D/g, '') })} /></label>
    {error && <p className="cc-alert cc-alert-danger cc-span-all" role="alert">{error}</p>}
    <ActionButton className="primary" type="submit">Продолжить</ActionButton>
  </form>;
}

export function CompanyProfile({ company, onChange }: { company: CompanyView; onChange?: () => void }) {
  const age = businessAgeMonths(company.registrationDate, new Date());
  const f = company.financials;
  return <Section title="Профиль бизнеса" className="cc-company-profile"
    aside={<>{company.isSynthetic && <SyntheticBadge />}{onChange && <button type="button" className="cc-link" onClick={onChange}>Изменить компанию</button>}</>}>
    <div className="cc-profile-grid">
      <dl className="cc-facts">
        <div><dt>Название</dt><dd>{company.name}</dd></div>
        <div><dt>ИНН</dt><dd>{company.inn}</dd></div>
        <div><dt>Дата регистрации</dt><dd>{formatDate(company.registrationDate)}{age !== null && <span className="cc-muted"> · {formatAge(age)}</span>}</dd></div>
        <div><dt>ОКВЭД</dt><dd>{company.okved}{company.okvedTitle ? ` — ${company.okvedTitle}` : ''}</dd></div>
        <div><dt>Регион</dt><dd>{company.region}</dd></div>
        {company.employees !== null && <div><dt>Сотрудников</dt><dd>{company.employees}</dd></div>}
      </dl>
      <div className="cc-financials">
        <h3>Финансовые показатели{f ? ` за ${f.period} год` : ''}</h3>
        {f ? <dl className="cc-facts">
          <div><dt>Выручка</dt><dd>{formatRub(f.revenue)}</dd></div>
          <div><dt>Расходы</dt><dd>{formatRub(f.expenses)}</dd></div>
          <div><dt>Прибыль</dt><dd>{formatRub(f.profit)}</dd></div>
          <div><dt>Текущие долги</dt><dd>{formatRub(f.currentDebt)}</dd></div>
        </dl> : <p className="cc-muted">Показателей в источниках нет. Их можно будет указать в заявке.</p>}
      </div>
    </div>
  </Section>;
}

const termOptions = [3, 6, 9, 12, 18, 24, 36, 48, 60];
function FinancingNeedStep({ company, need, onSubmit }: { company: CompanyView; need: Partial<FinancingNeed>; onSubmit: (need: FinancingNeed) => void }) {
  const [purpose, setPurpose] = useState<CreditPurpose | undefined>(need.purpose);
  const [amount, setAmount] = useState(groupDigits(need.requestedAmount));
  const [term, setTerm] = useState(need.requestedTermMonths ?? 12);
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = parseAmount(amount);
    if (!purpose) { setError('Выберите цель финансирования.'); return; }
    if (!value || value < 100_000 || value > 100_000_000) { setError('Укажите сумму от 100 000 до 100 000 000 ₽.'); return; }
    onSubmit({ purpose, requestedAmount: value, requestedTermMonths: term });
  };
  return <Section title="Потребность в финансировании" aside={company.demo && <span className="cc-muted">Значения из демо-сценария можно изменить</span>}>
    <form className="cc-need" onSubmit={submit}>
      <fieldset className="cc-purposes">
        <legend>На что нужны деньги</legend>
        {creditPurposes.map((value) => <label key={value} className="cc-choice" data-checked={purpose === value}>
          <input type="radio" name="purpose" value={value} checked={purpose === value} onChange={() => setPurpose(value)} />
          {purposeLabels[value]}
        </label>)}
      </fieldset>
      <div className="cc-form-grid">
        <label className="cc-field">Сумма, ₽
          <BusinessInput inputMode="numeric" value={amount} placeholder="3 000 000" onChange={(e) => setAmount(groupDigits(parseAmount(e.target.value)))} />
        </label>
        <label className="cc-field">Срок
          <select value={term} onChange={(e) => setTerm(Number(e.target.value))}>{termOptions.map((t) => <option key={t} value={t}>{months(t)}</option>)}</select>
        </label>
      </div>
      {error && <p className="cc-alert cc-alert-danger" role="alert">{error}</p>}
      <ActionButton className="primary" type="submit">Подобрать продукты</ActionButton>
    </form>
  </Section>;
}

function CreditProducts({ company, manual, need, onBack, onCreated }: {
  company: CompanyView; manual: ManualCompany | null; need: FinancingNeed; onBack: () => void; onCreated: (id: string) => void;
}) {
  const [matches, setMatches] = useState<ProductMatch[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    creditApi.products({ inn: manual ? undefined : company.inn, registrationDate: company.registrationDate, purpose: need.purpose,
      amount: need.requestedAmount, term: need.requestedTermMonths }, controller.signal)
      .then((data) => setMatches(data.matches)).catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
    return () => controller.abort();
  }, [company.inn, company.registrationDate, manual, need.purpose, need.requestedAmount, need.requestedTermMonths]);
  const choose = async (productId: string) => {
    setCreating(productId); setError('');
    try {
      const view = await creditApi.create({ companyInn: company.inn, ...(manual ? { company: manual } : {}), productId, ...need });
      onCreated(view.application.id);
    } catch (e) { setError(errorMessage(e)); setCreating(''); }
  };
  const eligible = matches?.filter((m) => m.eligible).length ?? 0;
  return <Section title="Подходящие кредитные продукты" aside={<SyntheticBadge text="Продукты и ставки синтетические" />}>
    <p className="cc-need-summary">{purposeLabels[need.purpose]} · <strong>{formatRub(need.requestedAmount)}</strong> на {months(need.requestedTermMonths)}
      <button type="button" className="cc-link" onClick={onBack}>Изменить</button></p>
    {error && <ErrorNote error={error} />}
    {!matches && !error && <Loading text="Подбираем продукты…" />}
    {matches && !eligible && <p className="cc-alert cc-alert-info">Ни один продукт не подходит под эти параметры. Измените сумму, срок или цель.</p>}
    <div className="cc-products">{matches?.map(({ product, eligible: ok, recommended, checks, estimatedMonthlyPayment }) =>
      <article key={product.id} className="cc-product" data-eligible={ok} data-recommended={recommended}>
        <header><h3>{product.name}</h3>{recommended && <span className="cc-badge cc-tone-accent">Рекомендуем</span>}</header>
        <p className="cc-muted">{product.description}</p>
        <dl className="cc-facts cc-facts-compact">
          <div><dt>Сумма</dt><dd>{formatRub(product.minAmount)} – {formatRub(product.maxAmount)}</dd></div>
          <div><dt>Срок</dt><dd>{product.minTermMonths}–{product.maxTermMonths} мес.</dd></div>
          <div><dt>Ставка</dt><dd>от {product.baseRate}% годовых</dd></div>
          <div><dt>Бизнесу не меньше</dt><dd>{formatAge(product.minBusinessAgeMonths)}</dd></div>
        </dl>
        <h4>{ok ? 'Почему подходит' : 'Почему не подходит'}</h4>
        <ul className="cc-checks">{checks.map((check) => <li key={check.code} data-ok={check.ok}><span aria-hidden="true">{check.ok ? '✓' : '✕'}</span>{check.text}</li>)}</ul>
        {estimatedMonthlyPayment && <p className="cc-payment">Ориентировочный платёж: <strong>{formatRub(estimatedMonthlyPayment)}</strong> в месяц</p>}
        <ActionButton className={recommended ? 'primary' : 'secondary'} disabled={!ok || !!creating} onClick={() => void choose(product.id)}>
          {creating === product.id ? 'Создаём заявку…' : ok ? 'Выбрать продукт' : 'Недоступен'}
        </ActionButton>
      </article>)}</div>
  </Section>;
}
