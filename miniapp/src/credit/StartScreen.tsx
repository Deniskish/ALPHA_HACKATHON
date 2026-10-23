// Demo entry: «Я клиент Альфа-Банка» (prefilled synthetic bank data) or «Я пока не клиент» (INN → lookup → confirmation).
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@alfalab/core-components-button';
import { Input } from '@alfalab/core-components-input';
import { Select } from '@alfalab/core-components-select';
import { creditApi, type CompanyView, type ManualCompany } from './api';
import { ErrorNote, Facts, Loading, Section, SyntheticBadge } from './ui';
import { businessAgeMonths, errorMessage, formatAge, formatDate, formatRub } from './format';
import { setSession } from './session';
import { validInn } from '../../api-server/company-data/inn';

type Path = 'client' | 'non_client' | null;
const nonClientHints = [['0005000050', 'кофейня, вторая точка'], ['0006000060', 'молодой интернет-магазин']];

export function StartScreen() {
  const [path, setPath] = useState<Path>(null);
  return <div className="op-page op-start">
    <section className="op-hero">
      <h1>Финансирование для вашего бизнеса</h1>
      <p>Опишите задачу — «Опора» подберёт кредит, проверит заявку и объяснит решение. Пять понятных шагов: потребность, подбор, анкета,
        рассмотрение и решение.</p>
    </section>
    <div className="op-choice" role="group" aria-label="Кто вы">
      <button type="button" className="op-choice-card" aria-pressed={path === 'client'} onClick={() => setPath('client')}>
        <strong>Я клиент Альфа-Банка</strong>
        <span>Данные о компании, оборотах и продуктах банка подставятся автоматически</span>
      </button>
      <button type="button" className="op-choice-card" aria-pressed={path === 'non_client'} onClick={() => setPath('non_client')}>
        <strong>Я пока не клиент Альфа-Банка</strong>
        <span>Найдём компанию по ИНН, вы подтвердите сведения и добавите финансовые показатели</span>
      </button>
    </div>
    <p className="op-disclaimer" role="note">Демонстрационный сценарий: реальной авторизации и данных Альфа-Банка нет. Компании и сведения о них
      синтетические. Рассматривается только действующий бизнес — ИП, ООО и другие формы.</p>
    {path === 'client' && <ClientLogin />}
    {path === 'non_client' && <NonClientLookup />}
  </div>;
}

function ClientLogin() {
  const [companies, setCompanies] = useState<CompanyView[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    creditApi.demoCompanies(controller.signal).then((data) => setCompanies(data.companies.filter((c) => c.relationship === 'client')))
      .catch((e) => { if (e.name !== 'AbortError') setError(errorMessage(e)); });
    return () => controller.abort();
  }, []);
  return <Section title="Вход в демо-кабинет клиента" aside={<SyntheticBadge />}>
    <p className="op-muted">Выберите компанию — как будто вы вошли в интернет-банк. Каждая воспроизводит свой сценарий решения.</p>
    {error && <ErrorNote error={error} />}
    {!companies && !error && <Loading text="Загружаем компании…" />}
    <div className="op-company-grid">{companies?.map((company) => <article key={company.inn} className="op-company-card" data-scenario={company.demo?.scenario}>
      <span className="op-eyebrow">{company.demo?.title}</span>
      <h3>{company.name}</h3>
      <p className="op-muted">ИНН {company.inn} · {company.region}</p>
      {company.bankProfile && <p>Обороты по счёту ≈ {formatRub(company.bankProfile.monthlyTurnover)} в месяц</p>}
      <p className="op-muted">{company.demo?.description}</p>
      <Button view="secondary" size={40} block aria-label={`Войти как ${company.name}`}
        onClick={() => setSession({ relationship: 'client', company, manual: null })}>Войти</Button>
    </article>)}</div>
  </Section>;
}

function NonClientLookup() {
  const [inn, setInn] = useState('');
  const [state, setState] = useState<{ busy: boolean; error: string; company: CompanyView | null; manual: boolean }>({ busy: false, error: '', company: null, manual: false });
  const find = async (event: FormEvent) => {
    event.preventDefault();
    if (!validInn(inn)) { setState({ busy: false, error: 'Проверьте ИНН: нужны 10 или 12 цифр с верной контрольной суммой.', company: null, manual: false }); return; }
    setState({ busy: true, error: '', company: null, manual: false });
    try { setState({ busy: false, error: '', company: (await creditApi.company(inn)).company, manual: false }); }
    catch (e) {
      const notFound = (e as { status?: number }).status === 404;
      setState({ busy: false, company: null, manual: notFound, error: notFound ? 'Компания не найдена в источниках. Заполните сведения вручную.' : errorMessage(e) });
    }
  };
  const company = state.company;
  return <Section title="Компания по ИНН">
    <form className="op-inline-form" onSubmit={find}>
      <Input label="ИНН компании или ИП" inputMode="numeric" maxLength={12} block value={inn}
        onChange={(_, { value }) => setInn(value.replace(/\D/g, ''))} hint="Демо: 0005000050 — кофейня, 0006000060 — молодой бизнес" />
      <Button view="accent" size={56} type="submit" loading={state.busy}>Найти</Button>
    </form>
    <div className="op-chips">{nonClientHints.map(([value, label]) =>
      <button key={value} type="button" className="op-chip" onClick={() => setInn(value)}>{value} · {label}</button>)}</div>
    {state.error && <p className={state.manual ? 'op-alert op-alert-info' : 'op-alert op-alert-danger'} role="status">{state.error}</p>}
    {company && <div className="op-confirm">
      <h3>Проверьте сведения о компании</h3>
      {company.isSynthetic && <SyntheticBadge text="Синтетический реестр (mock ФНС)" />}
      <Facts items={[['Название', company.name], ['ИНН', company.inn],
        ['Регистрация', `${formatDate(company.registrationDate)}${company.registrationDate ? ` · ${formatAge(businessAgeMonths(company.registrationDate, new Date()) ?? 0)}` : ''}`],
        ['ОКВЭД', `${company.okved}${company.okvedTitle ? ` — ${company.okvedTitle}` : ''}`], ['Регион', company.region]]} />
      {company.relationship === 'client' && <p className="op-alert op-alert-info">Эта компания — клиент банка в демо-данных: сведения подставятся автоматически.</p>}
      <Button view="accent" size={48} onClick={() => setSession({ relationship: company.relationship, company, manual: null })}>Данные верны, продолжить</Button>
    </div>}
    {state.manual && <ManualCompanyForm inn={inn} />}
  </Section>;
}

/** «ДД.ММ.ГГГГ» → «ГГГГ-ММ-ДД»; null for an impossible date. */
export function isoDate(text: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

const legalForms = ['ООО', 'АО', 'ИП', 'другое'].map((key) => ({ key, content: key }));
function ManualCompanyForm({ inn }: { inn: string }) {
  const [form, setForm] = useState({ name: '', legalForm: inn.length === 12 ? 'ИП' : 'ООО', registrationDate: '', okved: '', region: '' });
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (_: unknown, { value }: { value: string }) => setForm({ ...form, [key]: value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.name.trim().length < 2 || form.region.trim().length < 2) { setError('Укажите название и регион.'); return; }
    if (!/^\d{2}(\.\d{1,2}){0,2}$/.test(form.okved)) { setError('ОКВЭД в формате 62.01.'); return; }
    const registrationDate = isoDate(form.registrationDate);
    if (!registrationDate || businessAgeMonths(registrationDate, new Date()) === null) { setError('Укажите дату регистрации в формате ДД.ММ.ГГГГ — бизнес должен уже работать.'); return; }
    const manual: ManualCompany = { inn, name: form.name.trim(), legalForm: form.legalForm as ManualCompany['legalForm'], registrationDate,
      okved: form.okved, region: form.region.trim() };
    setSession({ relationship: 'non_client', manual, company: { ...manual, employees: null, okvedTitle: null, financials: null, source: 'manual',
      relationship: 'non_client', bankProfile: null, isSynthetic: false, demo: null, updatedAt: new Date().toISOString(), syntheticLabel: null } });
  };
  return <form className="op-form-grid" onSubmit={submit} aria-label="Сведения о компании">
    <Input label="Название" block value={form.name} onChange={set('name')} maxLength={160} />
    <Select label="Форма" block options={legalForms} selected={form.legalForm} onChange={({ selected }) => setForm({ ...form, legalForm: selected?.key ?? 'ООО' })} />
    <Input label="Дата регистрации" inputMode="numeric" placeholder="ДД.ММ.ГГГГ" block value={form.registrationDate} onChange={set('registrationDate')} maxLength={10} />
    <Input label="Основной ОКВЭД" block value={form.okved} onChange={set('okved')} maxLength={8} hint="Например, 62.01" />
    <Input label="Регион" block value={form.region} onChange={set('region')} maxLength={100} />
    {error && <p className="op-alert op-alert-danger op-span-all" role="alert">{error}</p>}
    <Button view="accent" size={48} type="submit">Продолжить</Button>
  </form>;
}
