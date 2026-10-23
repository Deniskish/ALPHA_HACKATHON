// SQLite persistence of the credit conveyor. The application state is canonical here, not in the browser.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ApplicationDocument, ApplicationEvent, ApplicationEventType, ApplicationState, Company, CreditApplication,
  CreditDecision, CreditProduct, ExternalCheck, RiskAssessment, ScoringResult,
} from './types';

type Row = Record<string, unknown>;
const json = (value: unknown) => JSON.stringify(value ?? null);
const parse = <T>(value: unknown): T => JSON.parse(String(value)) as T;

export class CreditStore {
  readonly db: DatabaseSync;

  constructor(file = ':memory:') {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=${file === ':memory:' ? 'MEMORY' : 'WAL'}; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS companies (
        inn TEXT PRIMARY KEY, name TEXT NOT NULL, legal_form TEXT NOT NULL, registration_date TEXT, okved TEXT NOT NULL,
        okved_title TEXT, region TEXT NOT NULL, employees INTEGER, financials_json TEXT NOT NULL, source TEXT NOT NULL,
        is_synthetic INTEGER NOT NULL, demo_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS credit_products (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, min_amount INTEGER NOT NULL, max_amount INTEGER NOT NULL,
        min_term_months INTEGER NOT NULL, max_term_months INTEGER NOT NULL, base_rate REAL NOT NULL,
        min_business_age_months INTEGER NOT NULL, purposes_json TEXT NOT NULL, required_documents_json TEXT NOT NULL,
        position INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS credit_applications (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, number TEXT NOT NULL UNIQUE,
        company_inn TEXT NOT NULL REFERENCES companies(inn), product_id TEXT REFERENCES credit_products(id),
        state TEXT NOT NULL, purpose TEXT, purpose_description TEXT NOT NULL, requested_amount INTEGER,
        requested_term_months INTEGER, declared_financials_json TEXT NOT NULL, attempt INTEGER NOT NULL,
        version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT,
        accepted_offer_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS application_documents (
        id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES credit_applications(id), type TEXT NOT NULL,
        file_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, text_characters INTEGER,
        uploaded_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS external_checks (
        id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES credit_applications(id), attempt INTEGER NOT NULL,
        provider TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL, checked_at TEXT NOT NULL,
        UNIQUE(application_id, attempt, provider));
      CREATE TABLE IF NOT EXISTS scoring_results (
        id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES credit_applications(id), attempt INTEGER NOT NULL,
        score INTEGER NOT NULL, risk_level TEXT NOT NULL, data_complete INTEGER NOT NULL, factors_json TEXT NOT NULL,
        created_at TEXT NOT NULL, UNIQUE(application_id, attempt));
      CREATE TABLE IF NOT EXISTS credit_decisions (
        id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES credit_applications(id), attempt INTEGER NOT NULL,
        outcome TEXT NOT NULL, offer_json TEXT NOT NULL, reasons_json TEXT NOT NULL, required_info_json TEXT NOT NULL,
        summary TEXT NOT NULL, next_action TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(application_id, attempt));
      CREATE TABLE IF NOT EXISTS application_events (
        id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES credit_applications(id), sequence INTEGER NOT NULL,
        type TEXT NOT NULL, from_state TEXT, to_state TEXT, message TEXT NOT NULL, payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL, UNIQUE(application_id, sequence));
      CREATE INDEX IF NOT EXISTS applications_by_company ON credit_applications(company_inn);
      CREATE TABLE IF NOT EXISTS risk_assessments (
        id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES credit_applications(id), attempt INTEGER NOT NULL,
        model_version TEXT NOT NULL, probability REAL NOT NULL, risk_level TEXT NOT NULL, top_factors_json TEXT NOT NULL,
        created_at TEXT NOT NULL, UNIQUE(application_id, attempt));`);
    // Additive migrations for databases created by earlier versions (e.g. a Docker volume).
    this.ensureColumn('companies', 'relationship', "TEXT NOT NULL DEFAULT 'non_client'");
    this.ensureColumn('companies', 'bank_profile_json', "TEXT NOT NULL DEFAULT 'null'");
    this.ensureColumn('credit_products', 'product_margin', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('credit_products', 'max_business_age_months', 'INTEGER');
    this.ensureColumn('credit_products', 'requires_existing_debt', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('credit_applications', 'declared_credit_history_json', "TEXT NOT NULL DEFAULT 'null'");
    this.ensureColumn('credit_applications', 'financing_json', "TEXT NOT NULL DEFAULT 'null'");
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = (this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (!columns.includes(column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  private depth = 0;

  close() { this.db.close(); }

  /** Runs fn atomically; nested calls join the outer transaction. fn must be synchronous. */
  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.depth++;
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { this.depth--; }
  }

  /** Synthetic records are restored on every start, so demo scenarios stay reproducible. */
  seed(companies: Company[], products: CreditProduct[]) {
    this.transaction(() => {
      companies.forEach((company) => this.upsertCompany(company));
      products.forEach((product, position) => this.db.prepare(`INSERT INTO credit_products (id, name, description, min_amount,
        max_amount, min_term_months, max_term_months, base_rate, min_business_age_months, purposes_json, required_documents_json,
        position, product_margin, max_business_age_months, requires_existing_debt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, min_amount=excluded.min_amount,
        max_amount=excluded.max_amount, min_term_months=excluded.min_term_months, max_term_months=excluded.max_term_months,
        base_rate=excluded.base_rate, min_business_age_months=excluded.min_business_age_months,
        purposes_json=excluded.purposes_json, required_documents_json=excluded.required_documents_json, position=excluded.position,
        product_margin=excluded.product_margin, max_business_age_months=excluded.max_business_age_months,
        requires_existing_debt=excluded.requires_existing_debt`)
        .run(product.id, product.name, product.description, product.minAmount, product.maxAmount, product.minTermMonths,
          product.maxTermMonths, product.baseRate, product.minBusinessAgeMonths, json(product.purposes), json(product.requiredDocuments), position,
          product.productMargin, product.maxBusinessAgeMonths, product.requiresExistingDebt ? 1 : 0));
      // Products removed from the synthetic catalogue disappear from matching (existing applications keep their reference).
      this.db.prepare(`DELETE FROM credit_products WHERE id NOT IN (${products.map(() => '?').join(',')})
        AND id NOT IN (SELECT DISTINCT product_id FROM credit_applications WHERE product_id IS NOT NULL)`).run(...products.map((p) => p.id));
    });
  }

  upsertCompany(company: Company) {
    this.db.prepare(`INSERT INTO companies (inn, name, legal_form, registration_date, okved, okved_title, region, employees,
      financials_json, source, is_synthetic, demo_json, updated_at, relationship, bank_profile_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(inn) DO UPDATE SET name=excluded.name,
      legal_form=excluded.legal_form, registration_date=excluded.registration_date, okved=excluded.okved, okved_title=excluded.okved_title,
      region=excluded.region, employees=excluded.employees, financials_json=excluded.financials_json, source=excluded.source,
      is_synthetic=excluded.is_synthetic, demo_json=excluded.demo_json, updated_at=excluded.updated_at,
      relationship=excluded.relationship, bank_profile_json=excluded.bank_profile_json`)
      .run(company.inn, company.name, company.legalForm, company.registrationDate, company.okved, company.okvedTitle, company.region,
        company.employees, json(company.financials), company.source, company.isSynthetic ? 1 : 0, json(company.demo), company.updatedAt,
        company.relationship, json(company.bankProfile));
  }

  getCompany(inn: string): Company | null {
    const row = this.db.prepare('SELECT * FROM companies WHERE inn=?').get(inn) as Row | undefined;
    return row ? companyFromRow(row) : null;
  }

  listDemoCompanies(): Company[] {
    return (this.db.prepare('SELECT * FROM companies WHERE is_synthetic=1 ORDER BY inn').all() as Row[]).map(companyFromRow);
  }

  listProducts(): CreditProduct[] {
    return (this.db.prepare('SELECT * FROM credit_products ORDER BY position').all() as Row[]).map(productFromRow);
  }

  getProduct(id: string): CreditProduct | null {
    const row = this.db.prepare('SELECT * FROM credit_products WHERE id=?').get(id) as Row | undefined;
    return row ? productFromRow(row) : null;
  }

  insertApplication(app: Omit<CreditApplication, 'number'>): CreditApplication {
    const result = this.db.prepare(`INSERT INTO credit_applications (id, number, company_inn, product_id, state, purpose,
      purpose_description, requested_amount, requested_term_months, declared_financials_json, attempt, version, created_at,
      updated_at, submitted_at, accepted_offer_json, declared_credit_history_json, financing_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(app.id, `pending-${app.id}`, app.companyInn, app.productId, app.state, app.purpose, app.purposeDescription,
        app.requestedAmount, app.requestedTermMonths, json(app.declaredFinancials), app.attempt, app.version, app.createdAt,
        app.updatedAt, app.submittedAt, json(app.acceptedOffer), json(app.declaredCreditHistory), json(app.financing));
    const number = `CR-${app.createdAt.slice(0, 4)}-${String(result.lastInsertRowid).padStart(5, '0')}`;
    this.db.prepare('UPDATE credit_applications SET number=? WHERE id=?').run(number, app.id);
    return { ...app, number };
  }

  /** Optimistic update: fails when another request changed the application meanwhile. */
  updateApplication(app: CreditApplication): CreditApplication {
    const next = { ...app, version: app.version + 1 };
    const changed = this.db.prepare(`UPDATE credit_applications SET product_id=?, state=?, purpose=?, purpose_description=?,
      requested_amount=?, requested_term_months=?, declared_financials_json=?, attempt=?, version=?, updated_at=?,
      submitted_at=?, accepted_offer_json=?, declared_credit_history_json=?, financing_json=? WHERE id=? AND version=?`)
      .run(next.productId, next.state, next.purpose, next.purposeDescription, next.requestedAmount, next.requestedTermMonths,
        json(next.declaredFinancials), next.attempt, next.version, next.updatedAt, next.submittedAt, json(next.acceptedOffer),
        json(next.declaredCreditHistory), json(next.financing), next.id, app.version);
    if (!changed.changes) throw new Error('CONCURRENT_APPLICATION_UPDATE');
    return next;
  }

  getApplication(id: string): CreditApplication | null {
    const row = this.db.prepare('SELECT * FROM credit_applications WHERE id=?').get(id) as Row | undefined;
    return row ? applicationFromRow(row) : null;
  }

  listApplications(filter: { companyInn?: string; states?: ApplicationState[] } = {}): CreditApplication[] {
    const rows = (filter.companyInn
      ? this.db.prepare('SELECT * FROM credit_applications WHERE company_inn=? ORDER BY seq DESC').all(filter.companyInn)
      : this.db.prepare('SELECT * FROM credit_applications ORDER BY seq DESC').all()) as Row[];
    const apps = rows.map(applicationFromRow);
    return filter.states ? apps.filter((app) => filter.states!.includes(app.state)) : apps;
  }

  addDocument(doc: ApplicationDocument) {
    this.db.prepare('INSERT INTO application_documents VALUES (?,?,?,?,?,?,?,?)')
      .run(doc.id, doc.applicationId, doc.type, doc.fileName, doc.mimeType, doc.sizeBytes, doc.textCharacters, doc.uploadedAt);
    return doc;
  }

  listDocuments(applicationId: string): ApplicationDocument[] {
    return (this.db.prepare('SELECT * FROM application_documents WHERE application_id=? ORDER BY uploaded_at, id').all(applicationId) as Row[])
      .map((row) => ({ id: String(row.id), applicationId: String(row.application_id), type: row.type as ApplicationDocument['type'],
        fileName: String(row.file_name), mimeType: String(row.mime_type), sizeBytes: Number(row.size_bytes),
        textCharacters: row.text_characters === null ? null : Number(row.text_characters), uploadedAt: String(row.uploaded_at) }));
  }

  addCheck(check: ExternalCheck) {
    this.db.prepare('INSERT INTO external_checks VALUES (?,?,?,?,?,?,?)')
      .run(check.id, check.applicationId, check.attempt, check.provider, check.status, json(check.payload), check.checkedAt);
    return check;
  }

  listChecks(applicationId: string, attempt?: number): ExternalCheck[] {
    const rows = (attempt === undefined
      ? this.db.prepare('SELECT * FROM external_checks WHERE application_id=? ORDER BY attempt, rowid').all(applicationId)
      : this.db.prepare('SELECT * FROM external_checks WHERE application_id=? AND attempt=? ORDER BY rowid').all(applicationId, attempt)) as Row[];
    return rows.map((row) => ({ id: String(row.id), applicationId: String(row.application_id), attempt: Number(row.attempt),
      provider: row.provider as ExternalCheck['provider'], status: row.status as ExternalCheck['status'],
      payload: parse<ExternalCheck['payload']>(row.payload_json), checkedAt: String(row.checked_at) }));
  }

  addScoring(result: ScoringResult) {
    this.db.prepare('INSERT INTO scoring_results VALUES (?,?,?,?,?,?,?,?)')
      .run(result.id, result.applicationId, result.attempt, result.score, result.riskLevel, result.dataComplete ? 1 : 0,
        json(result.factors), result.createdAt);
    return result;
  }

  latestScoring(applicationId: string): ScoringResult | null {
    const row = this.db.prepare('SELECT * FROM scoring_results WHERE application_id=? ORDER BY attempt DESC LIMIT 1').get(applicationId) as Row | undefined;
    return row ? { id: String(row.id), applicationId: String(row.application_id), attempt: Number(row.attempt), score: Number(row.score),
      riskLevel: row.risk_level as ScoringResult['riskLevel'], dataComplete: row.data_complete === 1,
      factors: parse(row.factors_json), createdAt: String(row.created_at) } : null;
  }

  addDecision(decision: CreditDecision) {
    this.db.prepare('INSERT INTO credit_decisions VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(decision.id, decision.applicationId, decision.attempt, decision.outcome, json(decision.offer), json(decision.reasons),
        json(decision.requiredInfo), decision.summary, decision.nextAction, decision.createdAt);
    return decision;
  }

  addRiskAssessment(risk: RiskAssessment) {
    this.db.prepare('INSERT INTO risk_assessments VALUES (?,?,?,?,?,?,?,?)')
      .run(risk.id, risk.applicationId, risk.attempt, risk.modelVersion, risk.probability, risk.riskLevel, json(risk.topFactors), risk.createdAt);
    return risk;
  }

  latestRiskAssessment(applicationId: string): RiskAssessment | null {
    const row = this.db.prepare('SELECT * FROM risk_assessments WHERE application_id=? ORDER BY attempt DESC LIMIT 1').get(applicationId) as Row | undefined;
    return row ? { id: String(row.id), applicationId: String(row.application_id), attempt: Number(row.attempt), modelVersion: String(row.model_version),
      probability: Number(row.probability), riskLevel: row.risk_level as RiskAssessment['riskLevel'], topFactors: parse(row.top_factors_json),
      createdAt: String(row.created_at) } : null;
  }

  latestDecision(applicationId: string): CreditDecision | null {
    const row = this.db.prepare('SELECT * FROM credit_decisions WHERE application_id=? ORDER BY attempt DESC LIMIT 1').get(applicationId) as Row | undefined;
    return row ? { id: String(row.id), applicationId: String(row.application_id), attempt: Number(row.attempt),
      outcome: row.outcome as CreditDecision['outcome'], offer: parse(row.offer_json), reasons: parse(row.reasons_json),
      requiredInfo: parse(row.required_info_json), summary: String(row.summary), nextAction: String(row.next_action),
      createdAt: String(row.created_at) } : null;
  }

  addEvent(event: { applicationId: string; type: ApplicationEventType; fromState?: ApplicationState | null; toState?: ApplicationState | null;
    message: string; payload?: Record<string, unknown> | null; createdAt: string }): ApplicationEvent {
    const { next } = this.db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM application_events WHERE application_id=?')
      .get(event.applicationId) as { next: number };
    const stored: ApplicationEvent = { id: randomUUID(), applicationId: event.applicationId, sequence: Number(next), type: event.type,
      fromState: event.fromState ?? null, toState: event.toState ?? null, message: event.message, payload: event.payload ?? null,
      createdAt: event.createdAt };
    this.db.prepare('INSERT INTO application_events VALUES (?,?,?,?,?,?,?,?,?)')
      .run(stored.id, stored.applicationId, stored.sequence, stored.type, stored.fromState, stored.toState, stored.message,
        json(stored.payload), stored.createdAt);
    return stored;
  }

  listEvents(applicationId: string): ApplicationEvent[] {
    return (this.db.prepare('SELECT * FROM application_events WHERE application_id=? ORDER BY sequence').all(applicationId) as Row[])
      .map((row) => ({ id: String(row.id), applicationId: String(row.application_id), sequence: Number(row.sequence),
        type: row.type as ApplicationEventType, fromState: (row.from_state ?? null) as ApplicationState | null,
        toState: (row.to_state ?? null) as ApplicationState | null, message: String(row.message),
        payload: parse(row.payload_json), createdAt: String(row.created_at) }));
  }
}

function companyFromRow(row: Row): Company {
  return { inn: String(row.inn), name: String(row.name), legalForm: row.legal_form as Company['legalForm'],
    registrationDate: (row.registration_date ?? null) as string | null, okved: String(row.okved),
    okvedTitle: (row.okved_title ?? null) as string | null, region: String(row.region),
    employees: row.employees === null ? null : Number(row.employees), financials: parse(row.financials_json),
    source: row.source as Company['source'], relationship: (row.relationship ?? 'non_client') as Company['relationship'],
    bankProfile: parse(row.bank_profile_json ?? 'null'), isSynthetic: row.is_synthetic === 1, demo: parse(row.demo_json),
    updatedAt: String(row.updated_at) };
}

function productFromRow(row: Row): CreditProduct {
  return { id: String(row.id), name: String(row.name), description: String(row.description), minAmount: Number(row.min_amount),
    maxAmount: Number(row.max_amount), minTermMonths: Number(row.min_term_months), maxTermMonths: Number(row.max_term_months),
    baseRate: Number(row.base_rate), productMargin: Number(row.product_margin ?? 0), minBusinessAgeMonths: Number(row.min_business_age_months),
    maxBusinessAgeMonths: row.max_business_age_months === null || row.max_business_age_months === undefined ? null : Number(row.max_business_age_months),
    requiresExistingDebt: row.requires_existing_debt === 1, purposes: parse(row.purposes_json),
    requiredDocuments: parse(row.required_documents_json), isSynthetic: true };
}

function applicationFromRow(row: Row): CreditApplication {
  return { id: String(row.id), number: String(row.number), companyInn: String(row.company_inn),
    productId: (row.product_id ?? null) as string | null, state: row.state as ApplicationState,
    purpose: (row.purpose ?? null) as CreditApplication['purpose'], purposeDescription: String(row.purpose_description),
    requestedAmount: row.requested_amount === null ? null : Number(row.requested_amount),
    requestedTermMonths: row.requested_term_months === null ? null : Number(row.requested_term_months),
    declaredFinancials: parse(row.declared_financials_json), attempt: Number(row.attempt), version: Number(row.version),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), submittedAt: (row.submitted_at ?? null) as string | null,
    acceptedOffer: parse(row.accepted_offer_json), declaredCreditHistory: parse(row.declared_credit_history_json ?? 'null'),
    financing: parse(row.financing_json ?? 'null') };
}
