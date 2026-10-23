# Модель данных

Каноническое состояние хранится в SQLite (`CREDIT_DB_PATH`). Схема создаётся при старте API (`credit/store.ts`);
синтетические компании и продукты обновляются при каждом старте, заявки и их история сохраняются. Вложенные структуры
(финансы, факторы, причины, payload) хранятся как JSON в текстовых колонках.

```mermaid
erDiagram
  COMPANIES ||--o{ CREDIT_APPLICATIONS : "подаёт"
  CREDIT_PRODUCTS ||--o{ CREDIT_APPLICATIONS : "выбран в"
  CREDIT_APPLICATIONS ||--o{ APPLICATION_DOCUMENTS : "содержит"
  CREDIT_APPLICATIONS ||--o{ EXTERNAL_CHECKS : "проверки по попыткам"
  CREDIT_APPLICATIONS ||--o{ RISK_ASSESSMENTS : "ML-оценка по попыткам"
  CREDIT_APPLICATIONS ||--o{ SCORING_RESULTS : "оценка по попыткам"
  CREDIT_APPLICATIONS ||--o{ CREDIT_DECISIONS : "решение по попыткам"
  CREDIT_APPLICATIONS ||--o{ APPLICATION_EVENTS : "история"

  COMPANIES {
    text inn PK
    text name
    text legal_form
    text registration_date
    text okved
    text region
    int employees
    json financials_json "revenue, expenses, profit, currentDebt, period | null"
    text source "synthetic | manual | registry"
    text relationship "client | non_client"
    json bank_profile_json "данные банка о клиенте | null"
    int is_synthetic
    json demo_json "сценарий и потребность для демо-компаний"
  }
  CREDIT_PRODUCTS {
    text id PK
    text name
    int min_amount
    int max_amount
    int min_term_months
    int max_term_months
    real base_rate "ключевая ставка + маржа"
    real product_margin
    int max_business_age_months
    int requires_existing_debt
    int min_business_age_months
    json purposes_json
    json required_documents_json
  }
  CREDIT_APPLICATIONS {
    int seq PK
    text id UK
    text number UK "CR-2026-00001"
    text company_inn FK
    text product_id FK
    text state
    text purpose
    text purpose_description
    int requested_amount
    int requested_term_months
    json declared_financials_json "+ activeLoans"
    json declared_credit_history_json
    int attempt
    int version
    text submitted_at
    json accepted_offer_json
    json financing_json "моделируемый кредитный счёт | null"
  }
  APPLICATION_DOCUMENTS {
    text id PK
    text application_id FK
    text type
    text file_name
    int size_bytes
    int text_characters
  }
  EXTERNAL_CHECKS {
    text id PK
    text application_id FK
    int attempt
    text provider "FNS | BKI | FINANCE"
    text status "OK | NO_HISTORY | NOT_FOUND | DOCUMENT_BASED"
    json payload_json
    text checked_at
  }
  RISK_ASSESSMENTS {
    text id PK
    text application_id FK
    int attempt
    text model_version
    real probability "P(default12m)"
    text risk_level
    json top_factors_json
  }
  SCORING_RESULTS {
    text id PK
    text application_id FK
    int attempt
    int score "0..100"
    text risk_level "LOW | MEDIUM | HIGH"
    int data_complete
    json factors_json
  }
  CREDIT_DECISIONS {
    text id PK
    text application_id FK
    int attempt
    text outcome "APPROVED | COUNTER_OFFER | NEEDS_INFO | REJECTED"
    json offer_json
    json reasons_json
    json required_info_json
    text summary
    text next_action
  }
  APPLICATION_EVENTS {
    text id PK
    text application_id FK
    int sequence
    text type
    text from_state
    text to_state
    text message
    json payload_json
  }
```

## Сущности

| Сущность | Описание | Тип в коде |
|---|---|---|
| Company | Компания-заявитель: реестровые факты, последние известные финансовые показатели, связь с банком (`relationship`) и синтетический банковский профиль клиента (`bankProfile`). `source`: `synthetic` — демо, `manual` — введена клиентом, `registry` — найдена необязательным поиском DaData/ФНС | `Company` |
| CreditProduct | Синтетический продукт: диапазоны суммы и срока, маржа и базовая ставка (ключевая + маржа), минимальный и максимальный срок работы бизнеса, требование действующего долга, цели и обязательные документы | `CreditProduct` |
| CreditApplication | Заявка: продукт, цель, сумма, срок, описание, заявленные показатели и кредитная история, состояние, номер попытки, версия, принятое предложение, моделируемое финансирование (`financing`) | `CreditApplication` |
| ApplicationDocument | Метаданные документа. Файл не загружается на сервер; хранится число символов, извлечённых в браузере | `ApplicationDocument` |
| ExternalCheck | Ответ mock-провайдера `{ provider, status, payload, checkedAt }` для конкретной попытки | `ExternalCheck` |
| RiskAssessment | Оценка ML-модели для попытки: версия модели, вероятность `default12m`, уровень, топ-факторы SHAP с текстом | `RiskAssessment` |
| ScoringResult | `score`, `riskLevel`, `factors[] { code, title, impact, maxImpact, effect, explanation }`, признак полноты данных | `ScoringResult` |
| CreditDecision | Итог, условия предложения, причины, запрошенные сведения, краткое резюме и следующий шаг | `CreditDecision` |
| ApplicationEvent | Запись истории с типом, переходом и понятным сообщением | `ApplicationEvent` |

## Целостность

- Новые колонки добавляются аддитивными миграциями (`ensureColumn`), поэтому база прежней версии открывается без потери заявок.
- Внешние ключи включены (`PRAGMA foreign_keys=ON`); проверки, оценки и решения уникальны по `(application_id, attempt)`,
  события — по `(application_id, sequence)`.
- Все изменения заявки идут через `updateApplication` с проверкой `version` (оптимистичная блокировка).
- Обработка и все переходы выполняются в транзакциях `BEGIN IMMEDIATE`; при ошибке частичных записей не остаётся
  (тест `credit/store.test.ts`).
- Синтетические компании нельзя перезаписать данными клиента: при создании заявки для синтетического ИНН
  присланные сведения о компании игнорируются.

## Браузер

`sessionStorage` хранит только демо-выбор «клиент / не клиент» и выбранную компанию (`opora.demo-session.v1`).
Всё, что касается заявки, — на сервере.
