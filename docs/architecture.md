# Архитектура

Монолит из двух процессов: web-клиент (React/Vite) и API (Express/TypeScript) с SQLite. Отдельные сервисы, очереди и
брокеры не нужны: обработка заявки занимает миллисекунды и выполняется синхронно в одной транзакции.

## Компоненты

```mermaid
flowchart TB
  subgraph Client["Web UI (miniapp/src)"]
    Dash["CreditDashboard"]
    New["NewCredit: CompanyProfile → FinancingNeed → CreditProducts"]
    WS["ApplicationWorkspace"]
    Proc["ApplicationProcessing"]
    Res["ApplicationResult"]
    Bank["BankWorkspace"]
  end
  subgraph Ingress["Ingress"]
    Vite["Vite dev proxy :3000"]
    Nginx["nginx :80 (Docker)"]
    Serve["serve.cjs (pm2)"]
  end
  subgraph API["API (miniapp/api-server)"]
    App["app.ts: CORS, лимиты, единые ошибки, health"]
    Router["credit/router.ts: валидация входа"]
    Service["credit/service.ts: ApplicationService"]
    SM["credit/state-machine.ts"]
    Ready["credit/readiness.ts: полнота заявки"]
    Match["credit/matching.ts: подбор продуктов"]
    Mocks["credit/mock-providers.ts: FNS · BKI · Finance"]
    Score["credit/scoring.ts: ScoringEngine"]
    Decide["credit/decision.ts: CreditDecisionEngine"]
    Store["credit/store.ts: CreditStore"]
    Company["company-data: необязательный поиск DaData / индекс ФНС"]
  end
  DB[("SQLite: credit.sqlite")]
  Client --> Ingress --> App --> Router --> Service
  Service --> SM & Ready & Match & Mocks & Score & Decide & Store
  Service -. "неизвестный ИНН" .-> Company
  Store --> DB
```

| Модуль | Ответственность |
|---|---|
| `credit/types.ts` | Сущности домена: Company, CreditProduct, CreditApplication, ApplicationDocument, ExternalCheck, ScoringResult, CreditDecision, ApplicationEvent |
| `credit/state-machine.ts` | Таблица допустимых переходов, `assertTransition`, поиск пути |
| `credit/store.ts` | SQLite-репозиторий, схема, сидирование синтетических данных, транзакции, оптимистичная блокировка |
| `credit/service.ts` | Жизненный цикл заявки: создание, изменение, документы, отправка, обработка, принятие, подписание; представления для клиента и банка |
| `credit/readiness.ts` | Полнота заявки — общее правило для READY_TO_SUBMIT, этапа проверки и фактора скоринга |
| `credit/matching.ts` | Подбор продуктов с объяснением по каждому условию |
| `credit/mock-providers.ts` | Локальные FNSMockProvider, BKIMockProvider, FinancialDataMockProvider |
| `credit/scoring.ts` | ScoringEngine: 6 факторов, 0–100, уровень риска |
| `credit/decision.ts` | CreditDecisionEngine: NEEDS_INFO / REJECTED / APPROVED / COUNTER_OFFER, расчёт встречного предложения |
| `credit/labels.ts` | Тексты для клиента без внутренних терминов; общие для API и UI |
| `credit/synthetic-data.ts` | Синтетические компании A–D, продукты и ответы «источников» |

Frontend импортирует из API только типы, подписи и чистые функции форматирования (`labels.ts`, `finance.ts`,
`readiness.ts`); серверный код (SQLite, crypto) в бандл не попадает — это проверяется при сборке.

## Обработка заявки

`POST /api/applications/:id/process` выполняет все этапы в одной транзакции SQLite. Если этап падает, транзакция
откатывается и заявка остаётся в `SUBMITTED`; повторный вызов после решения возвращает сохранённый результат.

```mermaid
sequenceDiagram
  autonumber
  participant UI as Web UI
  participant API as ApplicationService
  participant DB as SQLite
  participant M as Mock providers
  participant S as ScoringEngine
  participant D as CreditDecisionEngine
  UI->>API: POST /submit
  API->>DB: READY_TO_SUBMIT → SUBMITTED, attempt+1, событие
  UI->>API: POST /process
  API->>DB: BEGIN IMMEDIATE
  API->>DB: SUBMITTED → VALIDATING
  API->>API: полнота заявки (readiness)
  alt не хватает обязательных данных
    API->>DB: решение NEEDS_INFO, VALIDATING → NEEDS_INFO
  else данные полные
    API->>DB: VALIDATING → ENRICHING
    API->>M: FNS, BKI, FINANCE (без сети)
    API->>DB: 3 × ExternalCheck + события
    API->>DB: ENRICHING → SCORING
    API->>S: факторы → score, riskLevel
    API->>DB: ScoringResult + событие
    API->>DB: SCORING → DECISION
    API->>D: application, product, checks, score
    API->>DB: CreditDecision + событие, DECISION → итоговое состояние
  end
  API->>DB: COMMIT
  API-->>UI: заявка, решение, понятный таймлайн
  UI->>UI: проигрывает этапы «Проверяем данные компании → … → Формируем решение»
```

## Развёртывание

```mermaid
flowchart LR
  Browser -- ":3000" --> Nginx["miniapp: nginx<br/>статический build + /api proxy"]
  Nginx -- "http://api:3002" --> API["api: node dist/server.js"]
  API --> Vol[("volume credit-data<br/>/data/credit/credit.sqlite")]
```

Оба контейнера имеют healthcheck; frontend стартует после здорового API. Синтетические компании и продукты
сидируются при каждом старте API (upsert), заявки сохраняются в volume.

Вне Docker тот же frontend обслуживает `miniapp/scripts/serve.cjs` (pm2 через `ecosystem.config.cjs`), серверный
деплой — `ops/deploy.cjs` (сборка во временной папке, переключение артефактов, проверка и откат).
