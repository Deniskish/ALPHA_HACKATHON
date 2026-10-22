// Application lifecycle: every state change goes through the state machine and leaves an ApplicationEvent.
import { randomUUID } from 'node:crypto';
import { assertTransition, decisionStates, editableStates, processingStates } from './state-machine';
import { CreditStore } from './store';
import { defaultProviders, type ExternalDataProvider } from './mock-providers';
import { applicationReadiness } from './readiness';
import { ScoringEngine } from './scoring';
import { CreditDecisionEngine } from './decision';
import { matchProducts } from './matching';
import { clientStateLabels, documentLabels, providerLabels } from './labels';
import { creditProducts, syntheticCompanyRecords } from './synthetic-data';
import { formatRub } from './finance';
import {
  CreditError, type ApplicationDocument, type ApplicationState, type Company, type CreditApplication, type CreditDecision,
  type FinancingNeed,
} from './types';

export type CompanyLookup = (inn: string) => Promise<Company | null>;
export type ApplicationPatch = Partial<Pick<CreditApplication, 'productId' | 'purpose' | 'purposeDescription' | 'requestedAmount' |
  'requestedTermMonths' | 'declaredFinancials'>>;
export type NewApplication = { companyInn: string; company?: Company; patch: ApplicationPatch };
export type NewDocument = Pick<ApplicationDocument, 'type' | 'fileName' | 'mimeType' | 'sizeBytes' | 'textCharacters'>;

/** Client-facing names of processing stages, without internal service names. */
const stageMessages: Partial<Record<ApplicationState, string>> = {
  DATA_COLLECTION: 'Заявка заполняется', READY_TO_SUBMIT: 'Заявка готова к отправке', SUBMITTED: 'Заявка отправлена',
  VALIDATING: 'Проверяем данные компании', ENRICHING: 'Получаем сведения', SCORING: 'Оцениваем заявку', DECISION: 'Формируем решение',
  NEEDS_INFO: 'Нужны дополнительные данные', APPROVED: 'Заявка одобрена', COUNTER_OFFER: 'Подготовлено встречное предложение',
  REJECTED: 'Принято решение об отказе', OFFER_ACCEPTED: 'Предложение принято', COMPLETED: 'Договор подписан (симуляция)',
};

export class ApplicationService {
  constructor(
    readonly store = new CreditStore(),
    private readonly options: { now?: () => Date; providers?: ExternalDataProvider[]; lookup?: CompanyLookup } = {},
    private readonly scoring = new ScoringEngine(),
    private readonly decisions = new CreditDecisionEngine(),
  ) {
    store.seed(syntheticCompanyRecords(this.now()), creditProducts);
  }

  private now() { return this.options.now?.() ?? new Date(); }

  products() { return this.store.listProducts(); }

  demoCompanies() { return this.store.listDemoCompanies(); }

  matchProducts(registrationDate: string | null, need: Partial<FinancingNeed>) {
    return matchProducts(this.store.listProducts(), { registrationDate }, need, this.now());
  }

  /** Synthetic and previously saved companies first, then the configured registry lookup (if any). */
  async findCompany(inn: string): Promise<Company | null> {
    const stored = this.store.getCompany(inn);
    if (stored) return stored;
    try { return await this.options.lookup?.(inn) ?? null; } catch { return null; }
  }

  async create(input: NewApplication) {
    let company = this.store.getCompany(input.companyInn);
    if (!company || !company.isSynthetic) {
      const supplied = input.company ?? company ?? await this.findCompany(input.companyInn);
      if (!supplied) throw new CreditError(404, 'COMPANY_NOT_FOUND', 'Компания не найдена. Заполните сведения о компании вручную.');
      company = { ...supplied, updatedAt: this.now().toISOString() };
    }
    const created = this.store.transaction(() => {
      if (!company!.isSynthetic) this.store.upsertCompany(company!);
      const at = this.now().toISOString();
      const app = this.store.insertApplication({
        id: randomUUID(), companyInn: company!.inn, productId: null, state: 'DRAFT', purpose: null, purposeDescription: '',
        requestedAmount: null, requestedTermMonths: null, attempt: 0, version: 1, createdAt: at, updatedAt: at, submittedAt: null,
        acceptedOffer: null, declaredFinancials: company!.financials
          ? { revenue: company!.financials.revenue, expenses: company!.financials.expenses, currentDebt: company!.financials.currentDebt } : null,
      });
      this.store.addEvent({ applicationId: app.id, type: 'CREATED', toState: 'DRAFT', message: `Создана заявка ${app.number}`, createdAt: at });
      return Object.keys(input.patch).length ? this.applyPatch(app, input.patch) : app;
    });
    return this.view(created.id);
  }

  update(id: string, patch: ApplicationPatch, expectedVersion?: number) {
    this.store.transaction(() => {
      const app = this.editable(id);
      if (expectedVersion !== undefined && expectedVersion !== app.version)
        throw new CreditError(409, 'VERSION_CONFLICT', 'Заявка уже изменена. Обновите страницу.', { version: app.version });
      this.applyPatch(app, patch);
    });
    return this.view(id);
  }

  addDocument(id: string, document: NewDocument) {
    this.store.transaction(() => {
      const app = this.editable(id);
      const stored = this.store.addDocument({ ...document, id: randomUUID(), applicationId: id, uploadedAt: this.now().toISOString() });
      this.store.addEvent({ applicationId: id, type: 'DOCUMENT_ADDED', message: `Добавлен документ: ${documentLabels[stored.type]}`,
        payload: { documentId: stored.id, type: stored.type, fileName: stored.fileName }, createdAt: stored.uploadedAt });
      this.syncReadiness(app);
    });
    return this.view(id);
  }

  submit(id: string) {
    const result = this.store.transaction(() => {
      const app = this.require(id);
      if (app.state === 'SUBMITTED') return { replayed: true };
      if (app.state !== 'READY_TO_SUBMIT') {
        const readiness = this.readiness(app);
        if (editableStates.includes(app.state) && !readiness.ready)
          throw new CreditError(422, 'APPLICATION_INCOMPLETE', 'Заявка заполнена не полностью.', { missing: readiness.missing });
        assertTransition(app.state, 'SUBMITTED');
      }
      this.move({ ...app, attempt: app.attempt + 1, submittedAt: this.now().toISOString() }, 'SUBMITTED');
      return { replayed: false };
    });
    return { ...this.view(id), ...result };
  }

  /** Validation → external checks → scoring → decision, atomically. Repeated calls return the stored result. */
  process(id: string) {
    const result = this.store.transaction(() => {
      let app = this.require(id);
      const decided = this.store.latestDecision(id);
      if ((decisionStates.includes(app.state) || app.state === 'OFFER_ACCEPTED' || app.state === 'COMPLETED') && decided?.attempt === app.attempt)
        return { replayed: true };
      if (app.state !== 'SUBMITTED')
        throw new CreditError(409, 'INVALID_STATE', app.state === 'READY_TO_SUBMIT' || editableStates.includes(app.state)
          ? 'Сначала отправьте заявку.' : 'Заявку нельзя обработать в текущем состоянии.', { state: app.state });

      const company = this.store.getCompany(app.companyInn)!, product = this.store.getProduct(app.productId!)!;
      const documents = this.store.listDocuments(id), now = this.now(), at = now.toISOString();
      app = this.move(app, 'VALIDATING');
      const readiness = applicationReadiness(app, product, company, documents, now);
      if (!readiness.ready) {
        this.record(app, {
          outcome: 'NEEDS_INFO', offer: null, reasons: [{ code: 'VALIDATION_FAILED', kind: 'info', text: 'В заявке не хватает обязательных сведений' }],
          requiredInfo: readiness.missing.map((item) => ({ code: item.code, text: item.label })),
          summary: 'Чтобы принять решение, нам нужно ещё немного информации.', nextAction: 'Дополните заявку и отправьте её повторно.',
        });
        this.move(app, 'NEEDS_INFO');
        return { replayed: false };
      }

      app = this.move(app, 'ENRICHING');
      const checks = (this.options.providers ?? defaultProviders()).map((provider) => {
        const outcome = provider.check({ company, application: app, documents, now });
        const check = this.store.addCheck({ id: randomUUID(), applicationId: id, attempt: app.attempt, provider: provider.provider, ...outcome, checkedAt: at });
        this.store.addEvent({ applicationId: id, type: 'CHECK_COMPLETED', message: `${providerLabels[check.provider].client}: ${outcome.status === 'NOT_FOUND' ? 'сведения не найдены' : 'сведения получены'}`,
          payload: { provider: check.provider, status: check.status }, createdAt: at });
        return check;
      });

      app = this.move(app, 'SCORING');
      const score = this.scoring.score({ requestedAmount: app.requestedAmount!, registrationDate: company.registrationDate, checks, completeness: readiness.completeness, now });
      this.store.addScoring({ ...score, id: randomUUID(), applicationId: id, attempt: app.attempt, createdAt: at });
      this.store.addEvent({ applicationId: id, type: 'SCORED', message: 'Оценка заявки рассчитана', payload: { score: score.score, riskLevel: score.riskLevel }, createdAt: at });

      app = this.move(app, 'DECISION');
      const decision = this.decisions.decide({ application: app, product, products: this.store.listProducts(), registrationDate: company.registrationDate,
        externalChecks: checks, scoringResult: score, readiness, documents, now });
      this.record(app, decision);
      this.move(app, decision.outcome);
      return { replayed: false };
    });
    return { ...this.view(id), ...result };
  }

  acceptOffer(id: string) {
    this.store.transaction(() => {
      const app = this.require(id), decision = this.store.latestDecision(id);
      assertTransition(app.state, 'OFFER_ACCEPTED');
      this.move({ ...app, acceptedOffer: decision!.offer }, 'OFFER_ACCEPTED', { offer: decision!.offer });
    });
    return this.view(id);
  }

  /** Contract signing is simulated: no signature is created and no money is transferred. */
  sign(id: string) {
    this.store.transaction(() => {
      const app = this.require(id);
      assertTransition(app.state, 'COMPLETED');
      this.move(app, 'COMPLETED', { simulated: true });
    });
    return this.view(id);
  }

  list(companyInn?: string) {
    return this.store.listApplications({ companyInn }).map((app) => this.summary(app));
  }

  /** Client view: data, completeness, result and a client-friendly timeline. */
  view(id: string) {
    const app = this.require(id);
    const company = this.store.getCompany(app.companyInn)!, product = app.productId ? this.store.getProduct(app.productId) : null;
    const documents = this.store.listDocuments(id), decision = this.store.latestDecision(id);
    return {
      application: app, company, product, documents,
      readiness: applicationReadiness(app, product, company, documents, this.now()),
      status: { ...clientStateLabels[app.state], processing: processingStates.includes(app.state), editable: editableStates.includes(app.state) },
      decision: decision?.attempt === app.attempt ? decision : null,
      offerProduct: decision?.offer ? this.store.getProduct(decision.offer.productId) : null,
      timeline: this.store.listEvents(id).filter((e) => e.type === 'STATE_CHANGED' || e.type === 'CHECK_COMPLETED' || e.type === 'DOCUMENT_ADDED' || e.type === 'CREATED')
        .map((e) => ({ sequence: e.sequence, type: e.type, state: e.toState, message: e.message, createdAt: e.createdAt })),
    };
  }

  /** Bank view: internal process data including checks, scoring factors and raw events. */
  bankView(id: string) {
    const view = this.view(id), app = view.application;
    return { ...view, checks: this.store.listChecks(id, app.attempt), scoring: this.currentScoring(id, app.attempt),
      history: { checks: this.store.listChecks(id) }, events: this.store.listEvents(id) };
  }

  scoringResult(id: string) {
    const app = this.require(id), scoring = this.currentScoring(id, app.attempt);
    if (!scoring) throw new CreditError(404, 'SCORING_NOT_READY', 'Оценка заявки ещё не рассчитана.');
    return scoring;
  }

  decision(id: string) {
    const app = this.require(id), decision = this.store.latestDecision(id);
    if (!decision || decision.attempt !== app.attempt) throw new CreditError(404, 'DECISION_NOT_READY', 'Решение по заявке ещё не принято.');
    return decision;
  }

  events(id: string) { this.require(id); return this.store.listEvents(id); }

  bankList() {
    return this.store.listApplications().map((app) => {
      const scoring = this.currentScoring(app.id, app.attempt), decision = this.store.latestDecision(app.id);
      return { ...this.summary(app), score: scoring?.score ?? null, riskLevel: scoring?.riskLevel ?? null,
        outcome: decision?.attempt === app.attempt ? decision.outcome : null };
    });
  }

  private currentScoring(id: string, attempt: number) {
    const scoring = this.store.latestScoring(id);
    return scoring?.attempt === attempt ? scoring : null;
  }

  private summary(app: CreditApplication) {
    const company = this.store.getCompany(app.companyInn)!, product = app.productId ? this.store.getProduct(app.productId) : null;
    return { id: app.id, number: app.number, state: app.state, status: clientStateLabels[app.state], companyInn: app.companyInn,
      companyName: company.name, isSynthetic: company.isSynthetic, productId: app.productId, productName: product?.name ?? null,
      requestedAmount: app.requestedAmount, requestedTermMonths: app.requestedTermMonths, createdAt: app.createdAt, updatedAt: app.updatedAt };
  }

  private require(id: string) {
    const app = this.store.getApplication(id);
    if (!app) throw new CreditError(404, 'APPLICATION_NOT_FOUND', 'Заявка не найдена.');
    return app;
  }

  private editable(id: string) {
    const app = this.require(id);
    if (!editableStates.includes(app.state))
      throw new CreditError(409, 'APPLICATION_LOCKED', `Заявку нельзя изменить в состоянии «${clientStateLabels[app.state].title}».`, { state: app.state });
    return app;
  }

  private readiness(app: CreditApplication) {
    const company = this.store.getCompany(app.companyInn)!, product = app.productId ? this.store.getProduct(app.productId) : null;
    return applicationReadiness(app, product, company, this.store.listDocuments(app.id), this.now());
  }

  private applyPatch(app: CreditApplication, patch: ApplicationPatch) {
    if (patch.productId !== undefined && patch.productId !== null && !this.store.getProduct(patch.productId))
      throw new CreditError(400, 'VALIDATION_ERROR', 'Неизвестный кредитный продукт.', { field: 'productId' });
    const changed = (Object.keys(patch) as (keyof ApplicationPatch)[]).filter((key) => JSON.stringify(patch[key]) !== JSON.stringify(app[key]));
    if (!changed.length) return app;
    const at = this.now().toISOString();
    let next = this.store.updateApplication({ ...app, ...patch, updatedAt: at });
    this.store.addEvent({ applicationId: app.id, type: 'UPDATED', message: 'Данные заявки обновлены', payload: { fields: changed }, createdAt: at });
    next = this.syncReadiness(next);
    return next;
  }

  /** Keeps DRAFT / DATA_COLLECTION / READY_TO_SUBMIT / NEEDS_INFO consistent with the completeness rules. */
  private syncReadiness(app: CreditApplication) {
    app = this.store.getApplication(app.id)!;
    if (app.state === 'DRAFT') app = this.move(app, 'DATA_COLLECTION');
    const ready = this.readiness(app).ready;
    if (ready && (app.state === 'DATA_COLLECTION' || app.state === 'NEEDS_INFO')) return this.move(app, 'READY_TO_SUBMIT');
    if (!ready && (app.state === 'READY_TO_SUBMIT' || app.state === 'NEEDS_INFO')) return this.move(app, 'DATA_COLLECTION');
    return app;
  }

  private move(app: CreditApplication, to: ApplicationState, payload: Record<string, unknown> | null = null) {
    assertTransition(app.state, to);
    const at = this.now().toISOString();
    const next = this.store.updateApplication({ ...app, state: to, updatedAt: at });
    this.store.addEvent({ applicationId: app.id, type: 'STATE_CHANGED', fromState: app.state, toState: to,
      message: stageMessages[to] ?? to, payload, createdAt: at });
    return next;
  }

  private record(app: CreditApplication, decision: Omit<CreditDecision, 'id' | 'applicationId' | 'attempt' | 'createdAt'>) {
    const at = this.now().toISOString();
    const stored = this.store.addDecision({ ...decision, id: randomUUID(), applicationId: app.id, attempt: app.attempt, createdAt: at });
    this.store.addEvent({ applicationId: app.id, type: 'DECIDED', message: decision.outcome === 'NEEDS_INFO' ? 'Запрошены дополнительные данные' : 'Решение сформировано',
      payload: { outcome: stored.outcome, offer: stored.offer ? { ...stored.offer, amountText: formatRub(stored.offer.amount) } : null }, createdAt: at });
    return stored;
  }
}
