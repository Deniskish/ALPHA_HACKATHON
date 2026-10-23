# Архитектура

Монолит из двух процессов: web-клиент (React/Vite, Alfa Design System) и API (Express/TypeScript) с SQLite.
ML-модель риска обучается офлайн в `ml/` (Python) и исполняется внутри API (TypeScript), поэтому Python в рантайме не
нужен. LLM — необязательный внешний процесс (Ollama). Очереди и брокеры не нужны: обработка заявки занимает
миллисекунды и выполняется синхронно в одной транзакции.

## Компоненты

```mermaid
flowchart TB
  subgraph Client["Web UI (miniapp/src)"]
    Start["StartScreen: клиент / не клиент"]
    Dash["CreditDashboard"]
    Page["ApplicationPage: 5 шагов"]
    Steps["NeedStep · MatchStep · FormStep ·<br/>ApplicationProcessing · ApplicationResult"]
    Imp["Improvements · Explanation · FinancingPanel"]
    Bank["BankWorkspace"]
  end
  subgraph Ingress["Ingress"]
    Vite["Vite dev proxy :3000"]
    Nginx["nginx :80 (Docker)"]
    Serve["serve.cjs (pm2)"]
  end
  subgraph API["API (miniapp/api-server)"]
    App["app.ts: CORS, лимиты, trust proxy, request id, логи, Idempotency-Key, ошибки, health"]
    Router["credit/router.ts: валидация входа"]
    Service["credit/service.ts: ApplicationService"]
    SM["credit/state-machine.ts"]
    Ready["credit/readiness.ts: полнота заявки"]
    Match["credit/matching.ts + pricing.ts: подбор и цена"]
    Mocks["credit/mock-providers.ts: FNS · BKI · Finance"]
    Eval["credit/evaluation.ts: evaluate()"]
    ML["credit/features.ts + ml-model.ts: ML Risk"]
    Score["credit/scoring.ts: ScoringEngine"]
    Decide["credit/decision.ts: CreditDecisionEngine"]
    Imp2["credit/improvements.ts · financing.ts"]
    LLM["credit/llm.ts + explanations.ts + need-parser.ts"]
    Store["credit/store.ts: CreditStore"]
    Company["company-data: необязательный поиск DaData / индекс ФНС"]
  end
  DB[("SQLite: credit.sqlite")]
  Client --> Ingress --> App --> Router --> Service
  Service --> SM & Ready & Match & Mocks & Eval & Imp2 & LLM & Store
  Eval --> ML & Score & Decide
  LLM -. "AI_ENABLED=true" .-> Ollama["Ollama (необязательно)"]
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
| `credit/pricing.ts` | Демо-цена: ключевая ставка + маржа продукта + надбавка за риск (LOW 0, MEDIUM 2, HIGH 4 п.п.) |
| `credit/industry.ts` | ОКВЭД → отраслевая группа (общая с генератором датасета) |
| `credit/evaluation.ts` | Чистый конвейер `readiness → ML risk → scoring → decision`; им же считаются сценарии «что если» |
| `credit/features.ts` | Feature Builder: признаки ML-модели из тех же данных, что и скоринг; `null`, если финансов нет |
| `credit/ml-model.ts` | Исполнение экспортированного LightGBM и точный TreeSHAP, факторы простым языком ([ml-risk-model.md](ml-risk-model.md)) |
| `credit/scoring.ts` | ScoringEngine: 6 факторов, 0–100, уровень риска |
| `credit/decision.ts` | CreditDecisionEngine: NEEDS_INFO / REJECTED / APPROVED / COUNTER_OFFER, расчёт встречного предложения, учёт ML-риска |
| `credit/improvements.ts` | «Как улучшить заявку»: сценарии и рекомендации без сохранения |
| `credit/financing.ts` | Моделируемый кредитный счёт: остаток, следующий платёж, возможности |
| `credit/need-parser.ts`, `llm.ts`, `explanations.ts` | Разбор потребности, LLM-ассистент с проверками, шаблоны объяснений ([llm-architecture.md](llm-architecture.md)) |
| `credit/labels.ts` | Тексты для клиента без внутренних терминов; общие для API и UI |
| `credit/synthetic-data.ts` | Синтетические компании A–F (клиенты и не клиенты), банковские профили, 6 продуктов, ответы «источников» |

Frontend импортирует из API только типы, подписи и чистые модули без ввода-вывода (`labels.ts`, `finance.ts`,
`readiness.ts`, `industry.ts`, `state-machine.ts`, демо-значения из `synthetic-data.ts` для кнопки «Заполнить
демо-данными»); серверный код (SQLite, crypto, модель) в бандл не попадает — это проверяется при сборке.

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
    API->>DB: ENRICHING → RISK_ASSESSMENT
    API->>API: Feature Builder → ML Risk (probability, SHAP)
    API->>DB: RiskAssessment + событие (или «модель не применялась»)
    API->>DB: RISK_ASSESSMENT → SCORING
    API->>S: факторы → score, riskLevel
    API->>DB: ScoringResult + событие
    API->>DB: SCORING → DECISION
    API->>D: application, product, checks, score, ML risk
    API->>DB: CreditDecision + событие, DECISION → итоговое состояние
  end
  API->>DB: COMMIT
  API-->>UI: заявка, решение, понятный таймлайн
  UI->>UI: проигрывает этапы «Проверяем данные компании → … → Оцениваем риски → … → Формируем решение»
```

## Развёртывание

```mermaid
flowchart LR
  Browser -- ":3000" --> Nginx["miniapp: nginx<br/>статический build + /api proxy<br/>X-Forwarded-For, X-Request-Id"]
  Nginx -- "http://api:3002" --> API["api: node dist/server.js<br/>+ risk-model.json"]
  API --> Vol[("volume credit-data<br/>/data/credit/credit.sqlite")]
  API -. "AI_ENABLED=true" .-> Ollama["ollama (profile ai)<br/>volume ollama-models"]
```

Оба контейнера имеют healthcheck; frontend стартует после здорового API. nginx перезаписывает `X-Forwarded-For`
адресом клиента, API доверяет только loopback и частной сети compose (`TRUST_PROXY`), поэтому лимит запросов
считается по клиенту, а подделать адрес нельзя. Контейнер `ollama` запускается только с `--profile ai` и сам модели
не скачивает. Синтетические компании и продукты
сидируются при каждом старте API (upsert), заявки сохраняются в volume.

Вне Docker тот же frontend обслуживает `miniapp/scripts/serve.cjs` (pm2 через `ecosystem.config.cjs`), серверный
деплой — `ops/deploy.cjs` (сборка во временной папке, переключение артефактов, проверка и откат). Production-экземпляр
изолирован от соседнего проекта на том же сервере: `/opt/alfa-opora`, временные сборки и lock в
`/opt/alfa-opora-deploy`, PM2 `alfa-opora-frontend` (`127.0.0.1:3100`) и `alfa-opora-api` (`127.0.0.1:3102`), домен
`alfa.business-opora.ru`; идентификаторы — в `ops/production.cjs` ([README](../README.md#production-деплой-pm2)).
