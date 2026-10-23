// HTTP API of the credit conveyor. Input is validated here; business rules live in ApplicationService.
import { Router, type NextFunction, type Request, type Response } from 'express';
import { validInn } from '../company-data/inn';
import { documentLabels } from './labels';
import { SYNTHETIC_LABEL } from './synthetic-data';
import type { ApplicationPatch, ApplicationService, NewDocument } from './service';
import { creditPurposes, CreditError, type Company, type CreditPurpose, type DeclaredCreditHistory, type DeclaredFinancials, type DocumentType } from './types';

const invalid = (field: string, message: string) => new CreditError(400, 'VALIDATION_ERROR', message, { field });
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function integer(value: unknown, field: string, min: number, max: number, label: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw invalid(field, `${label}: целое число от ${min.toLocaleString('ru-RU')} до ${max.toLocaleString('ru-RU')}.`);
  return value;
}
function text(value: unknown, field: string, min: number, max: number, label: string) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max)
    throw invalid(field, `${label}: от ${min} до ${max} символов.`);
  return value.trim();
}
function purpose(value: unknown): CreditPurpose {
  if (!creditPurposes.includes(value as CreditPurpose)) throw invalid('purpose', `Цель финансирования: одно из ${creditPurposes.join(', ')}.`);
  return value as CreditPurpose;
}
function financials(value: unknown): DeclaredFinancials | null {
  if (value === null) return null;
  if (!isObject(value)) throw invalid('declaredFinancials', 'Финансовые показатели: объект { revenue, expenses, currentDebt }.');
  const result: DeclaredFinancials = {
    revenue: integer(value.revenue, 'declaredFinancials.revenue', 1, 1e12, 'Выручка'),
    expenses: integer(value.expenses, 'declaredFinancials.expenses', 0, 1e12, 'Расходы'),
    currentDebt: integer(value.currentDebt, 'declaredFinancials.currentDebt', 0, 1e12, 'Текущая задолженность'),
  };
  if (value.activeLoans !== undefined) result.activeLoans = integer(value.activeLoans, 'declaredFinancials.activeLoans', 0, 100, 'Количество действующих кредитов');
  return result;
}
function creditHistory(value: unknown): DeclaredCreditHistory | null {
  if (value === null) return null;
  if (!isObject(value) || typeof value.hadOverdue12m !== 'boolean')
    throw invalid('declaredCreditHistory', 'Кредитная история: объект { hadOverdue12m, maxOverdueDays }.');
  return { hadOverdue12m: value.hadOverdue12m,
    maxOverdueDays: value.hadOverdue12m ? integer(value.maxOverdueDays, 'declaredCreditHistory.maxOverdueDays', 1, 3650, 'Максимальная просрочка, дней') : 0 };
}

const patchFields = ['productId', 'purpose', 'purposeDescription', 'requestedAmount', 'requestedTermMonths', 'declaredFinancials', 'declaredCreditHistory'] as const;
export function parsePatch(body: Record<string, unknown>, allowed: readonly string[] = [...patchFields, 'version']): ApplicationPatch {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) throw invalid(unknown[0], `Неизвестное поле: ${unknown[0]}.`);
  const patch: ApplicationPatch = {};
  if ('productId' in body) {
    if (body.productId !== null && (typeof body.productId !== 'string' || !/^[a-z-]{1,40}$/.test(body.productId))) throw invalid('productId', 'Некорректный продукт.');
    patch.productId = body.productId as string | null;
  }
  if ('purpose' in body) patch.purpose = purpose(body.purpose);
  if ('purposeDescription' in body) {
    if (typeof body.purposeDescription !== 'string' || body.purposeDescription.length > 2000) throw invalid('purposeDescription', 'Описание цели: до 2000 символов.');
    patch.purposeDescription = body.purposeDescription;
  }
  if ('requestedAmount' in body) patch.requestedAmount = integer(body.requestedAmount, 'requestedAmount', 10_000, 1_000_000_000, 'Сумма');
  if ('requestedTermMonths' in body) patch.requestedTermMonths = integer(body.requestedTermMonths, 'requestedTermMonths', 1, 120, 'Срок в месяцах');
  if ('declaredFinancials' in body) patch.declaredFinancials = financials(body.declaredFinancials);
  if ('declaredCreditHistory' in body) patch.declaredCreditHistory = creditHistory(body.declaredCreditHistory);
  return patch;
}

export function parseCompany(value: unknown, now: Date): Company {
  if (!isObject(value)) throw invalid('company', 'Сведения о компании: объект.');
  const inn = String(value.inn ?? '');
  if (!validInn(inn)) throw invalid('company.inn', 'ИНН: 10 или 12 цифр с верной контрольной суммой.');
  const date = value.registrationDate;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date) > now)
    throw invalid('company.registrationDate', 'Дата регистрации в формате ГГГГ-ММ-ДД, не позже сегодняшнего дня.');
  if (typeof value.okved !== 'string' || !/^\d{2}(\.\d{1,2}){0,2}$/.test(value.okved)) throw invalid('company.okved', 'ОКВЭД в формате 62.01.');
  const legalForm = value.legalForm ?? (inn.length === 12 ? 'ИП' : 'ООО');
  if (!['ООО', 'АО', 'ИП', 'другое'].includes(legalForm as string)) throw invalid('company.legalForm', 'Форма: ООО, АО, ИП или другое.');
  const employees = value.employees === undefined || value.employees === null ? null : integer(value.employees, 'company.employees', 0, 1_000_000, 'Численность');
  return {
    inn, name: text(value.name, 'company.name', 2, 160, 'Название'), legalForm: legalForm as Company['legalForm'], registrationDate: date,
    okved: value.okved, okvedTitle: null, region: text(value.region, 'company.region', 2, 100, 'Регион'), employees,
    financials: null, source: value.source === 'registry' ? 'registry' : 'manual', relationship: 'non_client', bankProfile: null,
    isSynthetic: false, demo: null, updatedAt: now.toISOString(),
  };
}

function parseDocument(body: unknown): NewDocument {
  if (!isObject(body)) throw invalid('body', 'Ожидается JSON-объект.');
  if (typeof body.type !== 'string' || !Object.hasOwn(documentLabels, body.type)) throw invalid('type', `Тип документа: ${Object.keys(documentLabels).join(', ')}.`);
  return {
    type: body.type as DocumentType,
    fileName: text(body.fileName, 'fileName', 1, 200, 'Имя файла'),
    mimeType: typeof body.mimeType === 'string' && body.mimeType.length <= 100 ? body.mimeType : 'application/octet-stream',
    sizeBytes: integer(body.sizeBytes, 'sizeBytes', 1, 10 * 1024 * 1024, 'Размер файла (до 10 МБ), байт'),
    textCharacters: body.textCharacters === undefined || body.textCharacters === null ? null
      : integer(body.textCharacters, 'textCharacters', 0, 10_000_000, 'Число символов'),
  };
}

const companyView = (company: Company) => ({ ...company, syntheticLabel: company.isSynthetic ? SYNTHETIC_LABEL : null });

export function creditRouter(service: ApplicationService, now = () => new Date()) {
  const router = Router();
  const route = (handler: (req: Request, res: Response) => unknown) => async (req: Request, res: Response, next: NextFunction) => {
    try { const result = await handler(req, res); if (!res.headersSent) res.json(result); } catch (error) { next(error); }
  };
  const body = (req: Request) => { if (!isObject(req.body)) throw invalid('body', 'Ожидается JSON-объект.'); return req.body; };

  router.get('/credit/products', route((req) => {
    const { inn, registrationDate, purpose: goal, amount, term } = req.query;
    if (!inn && !registrationDate && !goal && !amount && !term) return { products: service.products(), keyRate: service.keyRate, syntheticLabel: SYNTHETIC_LABEL };
    const need = {
      purpose: goal === undefined ? undefined : purpose(goal),
      requestedAmount: amount === undefined ? undefined : integer(Number(amount), 'amount', 10_000, 1_000_000_000, 'Сумма'),
      requestedTermMonths: term === undefined ? undefined : integer(Number(term), 'term', 1, 120, 'Срок в месяцах'),
    };
    const date = typeof registrationDate === 'string' ? registrationDate
      : typeof inn === 'string' ? service.store.getCompany(inn)?.registrationDate ?? null : null;
    return { products: service.products(), keyRate: service.keyRate, matches: service.matchProducts(date, need), syntheticLabel: SYNTHETIC_LABEL };
  }));
  router.get('/demo/companies', route(() => ({ companies: service.demoCompanies().map(companyView), syntheticLabel: SYNTHETIC_LABEL })));
  router.get('/companies/:inn', route(async (req) => {
    if (!validInn(req.params.inn)) throw invalid('inn', 'ИНН: 10 или 12 цифр с верной контрольной суммой.');
    const company = await service.findCompany(req.params.inn);
    if (!company) throw new CreditError(404, 'COMPANY_NOT_FOUND', 'Компания не найдена. Заполните сведения вручную.');
    return { company: companyView(company) };
  }));

  router.post('/applications', route(async (req, res) => {
    const input = body(req), { companyInn, company, ...rest } = input;
    if (typeof companyInn !== 'string' || !validInn(companyInn)) throw invalid('companyInn', 'ИНН: 10 или 12 цифр с верной контрольной суммой.');
    const manual = company === undefined ? undefined : parseCompany(company, now());
    if (manual && manual.inn !== companyInn) throw invalid('company.inn', 'ИНН компании не совпадает с companyInn.');
    const view = await service.create({ companyInn, company: manual, patch: parsePatch(rest, patchFields) });
    res.status(201); return view;
  }));
  router.get('/applications', route((req) => {
    const inn = typeof req.query.inn === 'string' ? req.query.inn : undefined;
    if (inn !== undefined && !validInn(inn)) throw invalid('inn', 'Некорректный ИНН.');
    return { applications: service.list(inn) };
  }));
  router.get('/applications/:id', route((req) => service.view(req.params.id)));
  router.patch('/applications/:id', route((req) => {
    const input = body(req);
    const version = input.version === undefined ? undefined : integer(input.version, 'version', 1, Number.MAX_SAFE_INTEGER, 'Версия');
    return service.update(req.params.id, parsePatch(input), version);
  }));
  router.post('/applications/:id/submit', route((req) => service.submit(req.params.id)));
  router.post('/applications/:id/process', route((req) => service.process(req.params.id)));
  router.post('/applications/:id/accept', route((req) => service.acceptOffer(req.params.id)));
  router.post('/applications/:id/sign', route((req) => service.sign(req.params.id)));
  router.post('/applications/:id/issue', route((req) => service.issue(req.params.id)));
  router.post('/applications/:id/payments', route((req) => service.simulatePayment(req.params.id)));
  router.get('/applications/:id/matches', route((req) => service.matchesFor(req.params.id)));
  router.get('/applications/:id/risk', route((req) => service.riskResult(req.params.id)));
  router.get('/applications/:id/improvements', route((req) => service.improvements(req.params.id)));
  router.get('/applications/:id/explanation', route((req) => {
    const kind = req.query.kind ?? 'decision';
    if (kind !== 'decision' && kind !== 'improvements') throw invalid('kind', 'kind: decision или improvements.');
    return service.explanation(req.params.id, kind);
  }));
  router.get('/applications/:id/events', route((req) => ({ events: service.events(req.params.id) })));
  router.get('/applications/:id/scoring', route((req) => service.scoringResult(req.params.id)));
  router.get('/applications/:id/decision', route((req) => service.decision(req.params.id)));
  router.post('/applications/:id/documents', route((req, res) => {
    const view = service.addDocument(req.params.id, parseDocument(req.body)); res.status(201); return view;
  }));

  router.post('/assistant/parse-need', route((req) => {
    const text = body(req).text;
    if (typeof text !== 'string' || text.trim().length < 3 || text.length > 1000) throw invalid('text', 'Описание потребности: от 3 до 1000 символов.');
    return service.parseNeed(text);
  }));
  router.get('/bank/applications', route(() => ({ applications: service.bankList() })));
  router.get('/bank/applications/:id', route((req) => service.bankView(req.params.id)));

  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (!(error instanceof CreditError)) { next(error); return; }
    res.status(error.status).json({ error: error.message, code: error.code, ...(error.details === undefined ? {} : { details: error.details }) });
  });
  return router;
}
