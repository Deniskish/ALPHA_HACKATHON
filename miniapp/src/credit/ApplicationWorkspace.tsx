// Credit application workspace: parameters, purpose, financial indicators, documents and completeness.
import { useEffect, useRef, useState } from 'react';
import { creditApi, type ApplicationView } from './api';
import { ErrorNote, ProgressBar, Section, SyntheticBadge } from './ui';
import { errorMessage, formatRub, groupDigits, months, parseAmount } from './format';
import { ActionButton, BusinessInput, BusinessTextarea } from '../shared/Controls';
import { documentLabels, purposeLabels } from '../../api-server/credit/labels';
import { MIN_DESCRIPTION_LENGTH } from '../../api-server/credit/readiness';
import type { CreditPurpose, DeclaredFinancials, DocumentType } from '../../api-server/credit/types';

const demoDescriptions: Record<CreditPurpose, string> = {
  WORKING_CAPITAL: 'Закупка сырья и материалов под подтверждённые заказы на ближайшие два квартала.',
  EQUIPMENT: 'Покупка производственного оборудования для увеличения объёма выпуска.',
  EXPANSION: 'Открытие новой точки продаж и найм сотрудников.',
  REFINANCING: 'Рефинансирование действующего кредита на более длительный срок.',
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

type Fields = { purpose: CreditPurpose | null; amount: string; term: string; description: string; revenue: string; expenses: string; debt: string };
const fieldsOf = (view: ApplicationView): Fields => {
  const app = view.application, f = app.declaredFinancials;
  return { purpose: app.purpose, amount: groupDigits(app.requestedAmount), term: app.requestedTermMonths ? String(app.requestedTermMonths) : '',
    description: app.purposeDescription, revenue: groupDigits(f?.revenue), expenses: groupDigits(f?.expenses), debt: groupDigits(f?.currentDebt) };
};

export function ApplicationWorkspace({ view, onChange, onSubmit }: { view: ApplicationView; onChange: (view: ApplicationView) => void; onSubmit: () => void }) {
  const app = view.application, product = view.product, company = view.company;
  const [fields, setFields] = useState(() => fieldsOf(view));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const versionRef = useRef(app.version);
  versionRef.current = app.version;
  // Server responses (save, document upload) are the source of truth for the form.
  useEffect(() => { setFields(fieldsOf(view)); }, [app.version]);

  const run = async (label: string, action: () => Promise<ApplicationView>) => {
    setBusy(label); setError('');
    try { const next = await action(); onChange(next); return next; } catch (e) { setError(errorMessage(e)); return null; } finally { setBusy(''); }
  };
  const declared = (): DeclaredFinancials | null => {
    const revenue = parseAmount(fields.revenue), expenses = parseAmount(fields.expenses), currentDebt = parseAmount(fields.debt);
    return revenue && expenses !== null && currentDebt !== null ? { revenue, expenses, currentDebt } : null;
  };
  /** Sends only changed, valid fields; invalid numbers are reported instead of being saved. */
  const pendingPatch = () => {
    const patch: Record<string, unknown> = {};
    const amount = parseAmount(fields.amount), term = Number(fields.term), financials = declared();
    if (fields.purpose && fields.purpose !== app.purpose) patch.purpose = fields.purpose;
    if (amount && amount !== app.requestedAmount) patch.requestedAmount = amount;
    if (term && term !== app.requestedTermMonths) patch.requestedTermMonths = term;
    if (fields.description !== app.purposeDescription) patch.purposeDescription = fields.description;
    if (financials && JSON.stringify(financials) !== JSON.stringify(app.declaredFinancials)) patch.declaredFinancials = financials;
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
  const fillDemo = async () => {
    let current: ApplicationView | null = view;
    if (fields.description.trim().length < MIN_DESCRIPTION_LENGTH && app.purpose) {
      setFields({ ...fields, description: demoDescriptions[app.purpose] });
      current = await run('demo', () => creditApi.update(app.id, { purposeDescription: demoDescriptions[app.purpose!], version: versionRef.current }));
    }
    for (const type of product?.requiredDocuments ?? [])
      if (current && !current.documents.some((d) => d.type === type)) current = await run('demo', () => creditApi.addDocument(app.id,
        { type, fileName: `demo-${type.toLowerCase().replace(/_/g, '-')}.pdf`, mimeType: 'application/pdf', sizeBytes: 184_320, textCharacters: 5200 }));
  };
  const submit = async () => {
    const saved = await save();
    if (saved?.application.state === 'READY_TO_SUBMIT') onSubmit();
  };

  const needed = new Set<DocumentType>(product?.requiredDocuments ?? []);
  const requested = view.decision?.outcome === 'NEEDS_INFO' ? view.decision.requiredInfo : [];
  for (const item of requested) if (item.documentType) needed.add(item.documentType);
  const optionalTypes: DocumentType[] = company.source === 'manual' ? ['FINANCIAL_STATEMENT', 'REGISTRY_EXTRACT'] : ['FINANCIAL_STATEMENT'];
  const optional = optionalTypes.filter((type) => !needed.has(type));
  const dirty = Object.keys(pendingPatch()).length > 0;
  const canSubmit = app.state === 'READY_TO_SUBMIT' || (dirty && app.state !== 'NEEDS_INFO');
  const financials = declared();
  return <div className="cc-workspace">
    <div className="cc-workspace-main">
      {requested.length > 0 && <div className="cc-alert cc-alert-warning" role="status">
        <strong>{view.decision!.summary}</strong>
        <ul>{requested.map((item) => <li key={item.code}>{item.text}</li>)}</ul>
        <span>{view.decision!.nextAction}</span>
      </div>}
      {error && <ErrorNote error={error} />}
      <Section title="Параметры заявки" aside={company.isSynthetic && <SyntheticBadge />}>
        <div className="cc-form-grid">
          <div className="cc-field"><span>Продукт</span><strong>{product?.name ?? 'Не выбран'}</strong></div>
          <label className="cc-field">Цель
            <select value={fields.purpose ?? ''} onChange={(e) => setFields({ ...fields, purpose: e.target.value as CreditPurpose })} onBlur={() => void save()}>
              {(product?.purposes ?? []).map((p) => <option key={p} value={p}>{purposeLabels[p]}</option>)}
            </select>
          </label>
          <label className="cc-field">Сумма, ₽
            <BusinessInput inputMode="numeric" value={fields.amount} onChange={(e) => setFields({ ...fields, amount: groupDigits(parseAmount(e.target.value)) })} onBlur={() => void save()} />
            {product && <small className="cc-muted">{formatRub(product.minAmount)} – {formatRub(product.maxAmount)}</small>}
          </label>
          <label className="cc-field">Срок, мес.
            <BusinessInput inputMode="numeric" value={fields.term} onChange={(e) => setFields({ ...fields, term: e.target.value.replace(/\D/g, '').slice(0, 3) })} onBlur={() => void save()} />
            {product && <small className="cc-muted">от {product.minTermMonths} до {months(product.maxTermMonths)}</small>}
          </label>
        </div>
        <label className="cc-field">Опишите цель финансирования
          <BusinessTextarea rows={3} maxLength={2000} value={fields.description} placeholder="На что пойдут деньги и как это поможет бизнесу"
            onChange={(e) => setFields({ ...fields, description: e.target.value })} onBlur={() => void save()} />
          <small className="cc-muted">Не короче {MIN_DESCRIPTION_LENGTH} символов</small>
        </label>
      </Section>
      <Section title="Финансовые показатели за последний год">
        <p className="cc-muted">Если в источниках не найдётся отчётность, банк использует эти показатели вместе с приложенной бухгалтерской отчётностью.</p>
        <div className="cc-form-grid">
          <label className="cc-field">Выручка, ₽<BusinessInput inputMode="numeric" value={fields.revenue} onChange={(e) => setFields({ ...fields, revenue: groupDigits(parseAmount(e.target.value)) })} onBlur={() => void save()} /></label>
          <label className="cc-field">Расходы, ₽<BusinessInput inputMode="numeric" value={fields.expenses} onChange={(e) => setFields({ ...fields, expenses: groupDigits(parseAmount(e.target.value)) })} onBlur={() => void save()} /></label>
          <label className="cc-field">Текущие кредиты и займы, ₽<BusinessInput inputMode="numeric" value={fields.debt} onChange={(e) => setFields({ ...fields, debt: groupDigits(parseAmount(e.target.value)) })} onBlur={() => void save()} /></label>
          <div className="cc-field"><span>Прибыль</span><strong>{financials ? formatRub(financials.revenue - financials.expenses) : '—'}</strong></div>
        </div>
      </Section>
      <Section title="Документы" aside={<span className="cc-muted">Файлы не сохраняются — передаются только название и размер</span>}>
        <ul className="cc-documents">
          {[...needed, ...optional].map((type) => {
            const uploaded = view.documents.filter((d) => d.type === type);
            return <li key={type} data-done={uploaded.length > 0}>
              <div>
                <strong>{documentLabels[type]}</strong>
                <span className="cc-muted">{needed.has(type) ? 'Обязательный' : 'Необязательный'}{uploaded.length ? ` · ${uploaded.map((d) => d.fileName).join(', ')}` : ''}</span>
              </div>
              <div className="cc-document-actions">
                <label className="cc-file-button">{uploaded.length ? 'Заменить' : 'Загрузить файл'}
                  <input type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" disabled={!!busy}
                    onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void attach(type, file); }} />
                </label>
                {!uploaded.length && <button type="button" className="cc-link" disabled={!!busy} onClick={() => void attach(type)}>Демо-файл</button>}
              </div>
            </li>;
          })}
        </ul>
      </Section>
    </div>
    <aside className="cc-workspace-side">
      <Section title="Готовность заявки">
        <ProgressBar value={view.readiness.completeness} label="Полнота заявки" />
        <p className="cc-muted">Заполнено {Math.round(view.readiness.completeness * 100)}%</p>
        <ul className="cc-checklist">{view.readiness.items.map((item) => <li key={item.code} data-done={item.done} data-required={item.required}>
          <span aria-hidden="true">{item.done ? '✓' : item.required ? '•' : '○'}</span>{item.label}{!item.required && !item.done && <small> (желательно)</small>}
        </li>)}</ul>
        {company.isSynthetic && <button type="button" className="cc-link" disabled={!!busy} onClick={() => void fillDemo()}>Заполнить демо-данными</button>}
        <ActionButton className="primary cc-submit" disabled={!!busy || !canSubmit} onClick={() => void submit()}>
          {busy === 'save' ? 'Сохраняем…' : busy ? 'Подождите…' : 'Отправить заявку'}
        </ActionButton>
        {!canSubmit && <p className="cc-muted">{app.state === 'NEEDS_INFO' ? 'Дополните заявку по списку в начале страницы — после этого её можно будет отправить снова.'
          : 'Чтобы отправить заявку, заполните обязательные пункты.'}</p>}
      </Section>
    </aside>
  </div>;
}
