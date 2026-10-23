import express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import compression from 'compression';
import cors from 'cors';
import { companyDataRouter } from './company-data/router';
import { OfficialCompanyDataService } from './company-data/official-providers';
import { DaDataCompanyProvider } from './company-data/dadata';
import { CompanyDataService } from './company-data/service';
import { providerStatus } from './company-data/fns-index';
import { ApplicationService, type CompanyLookup } from './credit/service';
import { creditRouter } from './credit/router';
import { CreditStore } from './credit/store';
import { LlmAssistant, llmConfigFromEnv } from './credit/llm';
import { LightGbmRiskModel } from './credit/ml-model';

/**
 * Trusted reverse proxies for X-Forwarded-For. Default: loopback only (local frontend proxy). Docker Compose sets
 * "loopback,uniquelocal" because nginx reaches the API from a private network. `true` is rejected: it would let any
 * client choose its own rate-limit identity. A number means "trust N hops".
 */
export function trustProxySetting(value: string | undefined): string[] | number | false {
  const v = value?.trim();
  if (!v) return ['loopback'];
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  if (v === 'true') throw new Error('TRUST_PROXY=true is unsafe; list the proxy subnets (e.g. loopback,uniquelocal)');
  return v.split(',').map((part) => part.trim()).filter(Boolean);
}

type Log = (entry: Record<string, unknown>) => void;
const jsonLog: Log = (entry) => console.log(JSON.stringify({ time: new Date().toISOString(), ...entry }));
// INNs of sole proprietors identify a person: never write them to logs.
const safePath = (url: string) => url.split('?')[0].replace(/\d{10,12}/g, '[inn]');

/**
 * Idempotency-Key for POST commands: a retried request with the same key and body gets the stored response instead of
 * repeating the action (double click on «Смоделировать платёж», network retry). In-memory, per process, 24 h.
 */
function idempotency() {
  const ttl = 24 * 3600_000, limit = 2000;
  const entries = new Map<string, { hash: string; expires: number; status?: number; body?: unknown }>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.get('Idempotency-Key');
    if (req.method !== 'POST' || !key) return next();
    if (!/^[\w-]{8,128}$/.test(key)) { res.status(400).json({ error: 'Idempotency-Key: 8–128 символов (буквы, цифры, - и _).', code: 'VALIDATION_ERROR' }); return; }
    const now = Date.now();
    for (const [k, v] of entries) if (v.expires < now) entries.delete(k);
    const id = `${req.originalUrl.split('?')[0]}:${key}`, hash = createHash('sha256').update(JSON.stringify(req.body ?? null)).digest('hex');
    const known = entries.get(id);
    if (known) {
      if (known.hash !== hash) { res.status(422).json({ error: 'Этот Idempotency-Key уже использован с другим запросом.', code: 'IDEMPOTENCY_KEY_REUSED' }); return; }
      if (known.status === undefined) { res.status(409).json({ error: 'Запрос с этим ключом ещё выполняется.', code: 'IDEMPOTENCY_IN_PROGRESS' }); return; }
      res.setHeader('Idempotent-Replayed', 'true'); res.status(known.status).json(known.body); return;
    }
    if (entries.size >= limit) entries.delete(entries.keys().next().value!);
    entries.set(id, { hash, expires: now + ttl });
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      // Only successful results are remembered; a failed command may be retried with the same key.
      if (res.statusCode < 300) entries.set(id, { hash, expires: now + ttl, status: res.statusCode, body }); else entries.delete(id);
      return json(body);
    };
    next();
  };
}

export function createApp(options: { fnsDir?: string; env?: NodeJS.ProcessEnv; credit?: ApplicationService; creditDb?: string } = {}) {
  const env = options.env ?? process.env;
  const dadata = env.DADATA_API_KEY?.trim() ? new DaDataCompanyProvider(env.DADATA_API_KEY.trim()) : null;
  const companyService = dadata ? new CompanyDataService(dadata) : new OfficialCompanyDataService(options.fnsDir);
  // Registry lookup is optional: without DaData or an imported FNS index only synthetic and manual companies exist.
  const lookup: CompanyLookup = async (inn) => {
    const found = await companyService.getCompanyByInn(inn);
    if (!found?.company.name) return null;
    const c = found.company;
    return { inn, name: c.name!, legalForm: c.companyType === 'ООО' || c.companyType === 'АО' || c.companyType === 'ИП' ? c.companyType : 'другое',
      registrationDate: c.registrationDate, okved: c.okvedMain ?? '', okvedTitle: null, region: c.region ?? '', employees: c.employees,
      financials: null, source: 'registry', relationship: 'non_client', bankProfile: null, isSynthetic: false, demo: null, updatedAt: new Date().toISOString() };
  };
  const keyRate = Number(env.CREDIT_KEY_RATE);
  // The demo ML risk model (ml/, synthetic data) is one input of the decision engine; RISK_MODEL_ENABLED=false turns it off.
  const credit = options.credit ?? new ApplicationService(new CreditStore(options.creditDb ?? ':memory:'), { lookup,
    llm: new LlmAssistant(llmConfigFromEnv(env)), riskModel: env.RISK_MODEL_ENABLED === 'false' ? null : new LightGbmRiskModel(), ...(Number.isFinite(keyRate) && keyRate > 0 && keyRate < 50 ? { keyRate } : {}) });

  const app = express(); app.disable('x-powered-by');
  // Clients behind the trusted ingress get their own rate-limit key; untrusted peers cannot choose it via X-Forwarded-For.
  app.set('trust proxy', trustProxySetting(env.TRUST_PROXY));
  const log: Log | null = env.LOG_REQUESTS === 'true' || (env.LOG_REQUESTS !== 'false' && env.NODE_ENV === 'production') ? jsonLog : null;
  app.use((req, res, next) => {
    const incoming = req.get('X-Request-Id');
    const requestId = incoming && /^[\w.-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.locals.requestId = requestId; res.setHeader('X-Request-Id', requestId);
    if (log) {
      const started = process.hrtime.bigint();
      res.on('finish', () => log({ level: res.statusCode >= 500 ? 'error' : 'info', msg: 'request', requestId, method: req.method,
        path: safePath(req.originalUrl), status: res.statusCode, ms: Number(process.hrtime.bigint() - started) / 1e6 }));
    }
    next();
  });
  // The HTTPS ingress can route /api directly here, bypassing the frontend proxy.
  app.use(compression());
  app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  app.use(cors({ origin: (env.APP_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '48kb' }));
  const requests = new Map<string, { count: number; reset: number }>();
  // Requests per client and minute.
  const apiLimit = Math.max(1, Number(env.API_RATE_LIMIT) || 300);
  app.use('/api', (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of requests) if (value.reset < now) requests.delete(key);
    const key = req.ip ?? 'unknown';
    const usage = requests.get(key) ?? { count: 0, reset: now + 60000 };
    if (++usage.count > apiLimit) { res.setHeader('Retry-After', '60'); res.status(429).json({ error: 'Слишком много запросов. Повторите через минуту.', code: 'RATE_LIMITED' }); return; }
    requests.set(key, usage); next();
  });
  app.use('/api', idempotency());
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'credit-cabinet', revision: process.env.OPORA_RELEASE_SHA || null,
    credit: { products: credit.products().length, demoCompanies: credit.demoCompanies().length, storage: 'sqlite', keyRate: credit.keyRate,
      riskModel: credit.riskModelVersion }, ai: credit.llmStatus }));
  app.get('/api/providers/status', (_req, res) => res.json({
    company: { ...providerStatus(options.fnsDir), activeProvider: dadata ? 'dadata' : 'fns', dadata: dadata?.status() ?? { configured: false, state: 'not_configured', lastSuccess: null } },
    creditChecks: { fns: 'mock', bki: 'mock', finance: 'mock', network: false },
  }));
  app.use('/api/company', companyDataRouter(companyService));
  app.use('/api', creditRouter(credit));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Маршрут не найден.', code: 'NOT_FOUND' }));
  app.use((error: { status?: number }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error.status === 413 || error.status === 400 ? 400 : 500;
    if (status === 500) (log ?? jsonLog)({ level: 'error', msg: 'unhandled', requestId: res.locals.requestId, path: safePath(req.originalUrl),
      error: error instanceof Error ? error.message : String(error) });
    res.status(status).json({ error: status === 400 ? 'Некорректный или слишком большой запрос.' : 'Внутренняя ошибка сервера.', code: status === 400 ? 'INVALID_INPUT' : 'INTERNAL_ERROR' });
  });
  return app;
}
