# Запуск, конфигурация и деплой

Для проверки решения достаточно `docker compose up --build` (см. [README](../README.md#запуск-в-docker)). Здесь — локальный
запуск без Docker, переменные окружения и production-деплой публичного демо.

## Локальный запуск без Docker

```bash
npm ci --prefix miniapp
npm ci --prefix miniapp/api-server
npm run api:dev      # терминал 1: API на http://localhost:3002
npm run dev          # терминал 2: frontend на http://localhost:3000
```

Production-сборка без Docker: `npm run build`, затем `npm run api:server` и `npm start --prefix miniapp`
(`API_URL` — адрес API для frontend-сервера, по умолчанию `http://127.0.0.1:3002`).

### Переобучение ML-модели (необязательно)

Экспортированная модель уже лежит в `miniapp/api-server/credit/model/risk-model.json`; переобучать её для запуска не нужно.

```bash
cd ml && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
python generate_dataset.py && python train.py && python evaluate.py && python inference.py --check
```

Подробнее — [ml-risk-model.md](ml-risk-model.md) и [ml/README.md](../ml/README.md).

## Переменные окружения

Все необязательны; шаблон — [.env.example](../.env.example).

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `PORT`, `APP_ORIGIN` | Порт API, разрешённые origin для CORS | `3002`, `http://localhost:3000` |
| `API_HOST` | Адрес, на котором слушает API | `0.0.0.0`; в PM2-деплое `127.0.0.1` |
| `CREDIT_DB_PATH` | Файл SQLite | `miniapp/api-server/data/credit.sqlite`; в Docker `/data/credit/credit.sqlite` |
| `CREDIT_KEY_RATE` | Демо-ключевая ставка, % | `16` |
| `RISK_MODEL_ENABLED` | ML-модель риска (`false` — решения только по скорингу и правилам) | `true` |
| `AI_ENABLED` | LLM-ассистент | `false` |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_TIMEOUT_MS` | OpenAI-совместимый endpoint | `http://127.0.0.1:11434/v1`, `qwen2.5:7b-instruct`, —, `20000` |
| `API_RATE_LIMIT` | Запросов в минуту на клиента | `300` |
| `TRUST_PROXY` | Доверенные прокси для `X-Forwarded-For` | `loopback`; в Docker `loopback,uniquelocal` |
| `LOG_REQUESTS` | JSON-логи запросов (без ИНН в пути) | в production включены |
| `DADATA_API_KEY`, `FNS_DATA_DIR` | Необязательный поиск произвольной компании по ИНН ([интеграции](integrations.md#необязательный-реестровый-поиск-компании)) | — |
| `FRONTEND_PORT`, `API_PORT`, `OLLAMA_PORT` | Порты на хосте для Docker Compose | `3000`, `3002`, `11434` |

## Production-деплой публичного демо

Публичное демо — https://alfa.business-opora.ru. Оно работает рядом с другим проектом на том же сервере и не
пересекается с ним: свои каталоги, процессы PM2 и порты. Все идентификаторы — в [ops/production.cjs](../ops/production.cjs).

| | Этот экземпляр | Не трогать (другой проект) |
|---|---|---|
| Код | `/opt/alfa-opora` | `/opt/app` |
| Временные сборки и lock | `/opt/alfa-opora-deploy` (`release-*`, `deploy.lock`) | `/opt/opora-deploy` |
| PM2 | `alfa-opora-frontend`, `alfa-opora-api` | `opora-frontend`, `opora-api` |
| Порты | frontend `127.0.0.1:3100`, API `127.0.0.1:3102` | 3000, 3002 |
| Домен | `alfa.business-opora.ru` (HTTPS-ingress → `127.0.0.1:3100`) | `business-opora.ru` |

### Автоматический деплой (GitHub Actions)

[.github/workflows/deploy.yml](../.github/workflows/deploy.yml) запускается при push в `main` и вручную. Он копирует
`ops/deploy.cjs` и `ops/production.cjs` на сервер, под `flock` разворачивает **точный коммит** запуска и проверяет, что
`https://alfa.business-opora.ru/api/health` отдаёт этот же `revision`. Секреты (`SERVER_HOST`, `SERVER_USER`,
`SERVER_SSH_KEY_B64`) хранятся в настройках репозитория, не в git.

### Первый запуск на сервере

Один раз: `deploy.cjs` требует уже работающий `alfa-opora-api`, чтобы перенести его настройки.

```bash
git clone <repo> /opt/alfa-opora && mkdir -p /opt/alfa-opora-deploy && cd /opt/alfa-opora
npm ci --prefix miniapp && npm ci --prefix miniapp/api-server && npm run build
APP_ORIGIN=https://alfa.business-opora.ru node miniapp/scripts/restart-api.cjs   # alfa-opora-api на 127.0.0.1:3102
pm2 start ecosystem.config.cjs && pm2 save                                       # alfa-opora-frontend на 127.0.0.1:3100
node miniapp/scripts/check-production.cjs
```

### Обновление вручную

```bash
flock -n /opt/alfa-opora-deploy/deploy.lock node /opt/alfa-opora/ops/deploy.cjs /opt/alfa-opora <sha>
```

`deploy.cjs` принимает только `/opt/alfa-opora`, собирает и тестирует коммит во временной папке, переключает
артефакты, перезапускает и проверяет (`/api/health` на 3102, `check-production` на 3100, стабильность в PM2) только
`alfa-opora-*`, при ошибке откатывается. Процессы и порты другого проекта не перечисляются, не перезапускаются и не
удаляются (`ops/deploy.test.cjs`, `miniapp/scripts/restart-api.test.cjs`).
