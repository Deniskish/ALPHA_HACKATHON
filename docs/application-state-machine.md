# State machine заявки

Состояние заявки меняется только через `credit/state-machine.ts`. Любой переход, которого нет в таблице, отклоняется
с `409 INVALID_TRANSITION` (в `details` — `from`, `to` и допустимые варианты). Каждый переход записывается как
`ApplicationEvent` с типом `STATE_CHANGED`, `fromState`, `toState` и понятным клиенту сообщением.

```mermaid
stateDiagram-v2
  [*] --> DRAFT: POST /applications
  DRAFT --> DATA_COLLECTION: первые данные
  DATA_COLLECTION --> READY_TO_SUBMIT: заявка полная
  READY_TO_SUBMIT --> DATA_COLLECTION: данные стали неполными
  READY_TO_SUBMIT --> SUBMITTED: POST /submit
  SUBMITTED --> VALIDATING: POST /process
  VALIDATING --> NEEDS_INFO: не хватает обязательных данных
  VALIDATING --> ENRICHING
  ENRICHING --> RISK_ASSESSMENT: проверки ФНС, БКИ, финансы
  RISK_ASSESSMENT --> SCORING: ML-оценка риска (или пропуск)
  SCORING --> DECISION
  DECISION --> APPROVED
  DECISION --> COUNTER_OFFER
  DECISION --> NEEDS_INFO
  DECISION --> REJECTED
  NEEDS_INFO --> DATA_COLLECTION: дополнение, заявка ещё неполная
  NEEDS_INFO --> READY_TO_SUBMIT: дополнение, заявка полная
  APPROVED --> OFFER_ACCEPTED: POST /accept
  COUNTER_OFFER --> OFFER_ACCEPTED: POST /accept
  OFFER_ACCEPTED --> COMPLETED: POST /sign (симуляция)
  COMPLETED --> ACTIVE_FINANCING: POST /issue (симуляция)
  REJECTED --> [*]
  ACTIVE_FINANCING --> [*]
```

## Состояния

| Состояние | Что видит клиент | Кто переводит | Можно менять данные |
|---|---|---|---|
| DRAFT | Черновик | Создание заявки | да |
| DATA_COLLECTION | Заполнение заявки | Изменение данных или документа | да |
| READY_TO_SUBMIT | Готова к отправке | Автоматически, когда все обязательные пункты выполнены | да |
| SUBMITTED | Отправлена | `POST /submit`; номер попытки `attempt` увеличивается | нет |
| VALIDATING | Проверяем данные компании | `POST /process` | нет |
| ENRICHING | Получаем сведения | Обработка | нет |
| RISK_ASSESSMENT | Оцениваем риски | Обработка: ML-модель риска; при отключённой модели или без финансов этап фиксируется событием без оценки | нет |
| SCORING | Оцениваем заявку | Обработка | нет |
| DECISION | Формируем решение | Обработка | нет |
| NEEDS_INFO | Нужны дополнительные данные | Проверка или решение | да |
| APPROVED | Одобрено | Решение | нет |
| COUNTER_OFFER | Встречное предложение | Решение | нет |
| REJECTED | Отказ (финальное) | Решение | нет |
| OFFER_ACCEPTED | Предложение принято | `POST /accept`; условия сохраняются в `acceptedOffer` | нет |
| COMPLETED | Договор подписан (симуляция) | `POST /sign` | нет |
| ACTIVE_FINANCING | Финансирование выдано (симуляция, финальное) | `POST /issue`; создаётся `financing`, платежи — `POST /payments` без смены состояния | нет |

Промежуточные состояния обработки (`VALIDATING` … `DECISION`, включая `RISK_ASSESSMENT`) существуют внутри одной транзакции и видны в истории;
клиент наблюдает их как таймлайн.

## Правила

- **Видимые шаги.** Пять шагов интерфейса отображаются на состояния: Потребность и Подбор — `DRAFT`/`DATA_COLLECTION`
  без продукта, Анкета — редактируемые состояния, Рассмотрение — `SUBMITTED` … `DECISION`, Решение — итоговые
  состояния и после них ([five-step-client-journey.md](five-step-client-journey.md)).

- **Полнота** (`credit/readiness.ts`) пересчитывается после каждого изменения и документа; пункты сгруппированы как
  анкета (компания, финансы, обязательства, кредитная история, параметры, документы). Обязательно: выбран продукт;
  цель, сумма, срок, срок работы бизнеса и наличие долга (для рефинансирования) соответствуют продукту; описание цели
  не короче 20 символов; обязательные документы продукта. Для **не клиента** обязательны также финансовые показатели
  и бухгалтерская отчётность. Обязательства и кредитная история желательны и влияют на полноту.
- **Изменения** разрешены только в `DRAFT`, `DATA_COLLECTION`, `READY_TO_SUBMIT`, `NEEDS_INFO`; иначе
  `409 APPLICATION_LOCKED`. `PATCH` с `version` защищает от одновременной правки (`409 VERSION_CONFLICT`).
- **Отправка** неполной заявки — `422 APPLICATION_INCOMPLETE` со списком недостающего. Повторный `submit` в
  `SUBMITTED` идемпотентен. Из `NEEDS_INFO` отправить нельзя, пока заявка не дополнена (сначала переход в `READY_TO_SUBMIT`).
- **Обработка** идемпотентна: если решение по текущей попытке уже есть, `POST /process` возвращает его с
  `replayed: true` и не создаёт новых проверок, оценок и событий. Сбой на любом этапе откатывает всю обработку.
- **Попытки.** Проверки, скоринг и решения привязаны к `attempt`; после NEEDS_INFO и повторной отправки создаются
  новые записи, прежние остаются в истории (`history.checks` в банковском представлении).

## События

| Тип | Когда |
|---|---|
| CREATED | Создание заявки |
| UPDATED | Изменение данных (в `payload.fields` — изменённые поля) |
| STATE_CHANGED | Любой переход состояния |
| DOCUMENT_ADDED | Добавлен документ |
| CHECK_COMPLETED | Получен ответ mock-провайдера |
| RISK_ASSESSED | Оценка ML-модели (`probability`, `riskLevel`, `modelVersion`) или запись о том, что модель не применялась |
| SCORED | Рассчитан скоринг (`score`, `riskLevel`) |
| DECIDED | Сформировано решение (`outcome`, `offer`) |
| PAYMENT_SIMULATED | Учтён моделируемый платёж (`installment`, `amount`) |

Номер события `sequence` непрерывен в пределах заявки. История доступна клиенту в упрощённом виде (`timeline`) и
банковской стороне полностью (`GET /api/applications/:id/events`, `GET /api/bank/applications/:id`).

Тесты: `miniapp/api-server/credit/state-machine.test.ts`, переходы через API — `credit/api.test.ts`.
