import express from 'express';
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
      financials: null, source: 'registry', isSynthetic: false, demo: null, updatedAt: new Date().toISOString() };
  };
  const credit = options.credit ?? new ApplicationService(new CreditStore(options.creditDb ?? ':memory:'), { lookup });

  const app = express(); app.disable('x-powered-by');
  // Production ingress is local Nginx (or the local frontend proxy). Trust only
  // loopback hops, so clients behind it do not share the proxy's rate-limit key.
  // Untrusted public peers cannot choose their identity via X-Forwarded-For.
  app.set('trust proxy', 'loopback');
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
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'credit-cabinet', revision: process.env.OPORA_RELEASE_SHA || null,
    credit: { products: credit.products().length, demoCompanies: credit.demoCompanies().length, storage: 'sqlite' } }));
  app.get('/api/providers/status', (_req, res) => res.json({
    company: { ...providerStatus(options.fnsDir), activeProvider: dadata ? 'dadata' : 'fns', dadata: dadata?.status() ?? { configured: false, state: 'not_configured', lastSuccess: null } },
    creditChecks: { fns: 'mock', bki: 'mock', finance: 'mock', network: false },
  }));
  app.use('/api/company', companyDataRouter(companyService));
  app.use('/api', creditRouter(credit));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Маршрут не найден.', code: 'NOT_FOUND' }));
  app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error.status === 413 || error.status === 400 ? 400 : 500;
    res.status(status).json({ error: status === 400 ? 'Некорректный или слишком большой запрос.' : 'Внутренняя ошибка сервера.', code: status === 400 ? 'INVALID_INPUT' : 'INTERNAL_ERROR' });
  });
  return app;
}
