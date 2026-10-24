# Third-party notices

Проект использует перечисленные ниже сторонние компоненты. Версии — из `package-lock.json` на момент подготовки
MVP. Полные тексты лицензий находятся в соответствующих пакетах (`node_modules/<package>/LICENSE`) и по ссылкам.
Транзитивные зависимости распространяются на условиях своих лицензий и перечислены в `package-lock.json`.

## Frontend (`miniapp/package.json`)

| Компонент | Версия | Лицензия | Назначение |
|---|---|---|---|
| react, react-dom | 18.3.1 | MIT | UI |
| @alfalab/core-components-* (button, input, textarea, select, radio, radio-group, tag, steps, tabs, status, tooltip, progress-bar, typography, plate, amount, table, segmented-control, icon-view, circular-progress-bar, badge, link, divider, skeleton, gap, vars, config, stack-context и их зависимости) | по `package-lock.json` | MIT | Дизайн-система Альфа-Банка (открытая, github.com/core-ds/core-components): компоненты и токены |
| @alfalab/icons-glyph | 2.x | MIT | Иконки Alfa |
| pdfjs-dist | 6.3.289 | Apache-2.0 | Чтение PDF в браузере |
| mammoth | 1.12.3 | BSD-2-Clause | Чтение DOCX в браузере |
| tesseract.js (и tesseract.js-core) | 7.0.0 | Apache-2.0 | Распознавание сканов в браузере |
| @tesseract.js-data/eng, @tesseract.js-data/rus | 1.0.0 | MIT (пакет); данные tessdata — Apache-2.0 | Языковые модели OCR |
| express | 4.22.3 | MIT | Production-сервер статики |
| compression | 1.8.2 | MIT | Сжатие ответов |
| http-proxy-middleware | 3.0.7 | MIT | Proxy `/api` |

Инструменты разработки: vite 5.4.21 (MIT), @vitejs/plugin-react 4.7.0 (MIT), typescript 5.9.3 (Apache-2.0),
tsx 4.20.6 (MIT), playwright 1.63.0 (Apache-2.0), @types/* (MIT).

## API (`miniapp/api-server/package.json`)

| Компонент | Версия | Лицензия | Назначение |
|---|---|---|---|
| express | 4.22.3 | MIT | HTTP API |
| cors | 2.8.5 | MIT | CORS |
| compression | 1.8.2 | MIT | Сжатие ответов |
| dotenv | 17.x | BSD-2-Clause | Загрузка `.env` |
| saxes | 6.0.0 | ISC | Потоковый разбор XML ФНС (необязательный импорт) |
| iconv-lite | 0.7.3 | MIT | Кодировки XML ФНС |
| yauzl | 3.4.0 | MIT | Чтение ZIP-выгрузок ФНС |

Инструменты разработки и тестов: typescript (Apache-2.0), tsx (MIT), yaml 2.9.1 (ISC), @types/* (MIT).

## ML (офлайн, `ml/requirements.txt`)

Не входят в образы и рантайм API: модель экспортируется в JSON и исполняется кодом проекта.

| Компонент | Версия | Лицензия |
|---|---|---|
| numpy | 2.5.4 | BSD-3-Clause |
| pandas | 3.1.0 | BSD-3-Clause |
| scikit-learn | 1.9.1 | BSD-3-Clause |
| LightGBM | 4.7.0 | MIT |
| joblib | 1.6.0 | BSD-3-Clause |

Алгоритм TreeSHAP в `credit/ml-model.ts` реализован по публикации Lundberg et al. (2018) и эталонной реализации
пакета shap (MIT).

## Необязательный LLM

Не входят в репозиторий и не скачиваются автоматически.

| Компонент | Лицензия |
|---|---|
| Docker-образ `ollama/ollama:0.24.0` (профиль `ai`) | MIT |
| Модель Qwen2.5-7B-Instruct (`qwen2.5:7b-instruct`) | Apache-2.0 |

## Среда выполнения и образы

| Компонент | Лицензия |
|---|---|
| Node.js 22 (включая встроенный SQLite, `node:sqlite`) | MIT; SQLite — public domain |
| Docker-образ `node:22-bookworm-slim` | Node.js — MIT; Debian — лицензии пакетов дистрибутива |
| Docker-образ `nginx:1.28-alpine` | nginx — BSD-2-Clause; Alpine — лицензии пакетов дистрибутива |

## Смоделированные и необязательные интеграции

Проверяемое демо не обращается к внешним сервисам: источники данных заменены локальными mock-провайдерами с тем же
контрактом, который понадобился бы реальной интеграции ([docs/integrations.md](docs/integrations.md)).

| Источник | В демо | Внешний сервис |
|---|---|---|
| ФНС / ЕГРЮЛ / ЕГРИП | Mock-провайдер и синтетический реестр; необязательно — локальный индекс официальных открытых выгрузок ФНС (`npm run sync:fns`) | Не вызывается |
| БКИ (кредитная история) | Mock-провайдер, синтетические данные | Не вызывается |
| Финансовые данные и «данные банка» о клиенте | Mock-провайдер и синтетические профили; не клиент вводит показатели сам | Не вызывается |
| DaData | Необязательный провайдер поиска компании по ИНН, включается только ключом `DADATA_API_KEY`; основному демо не нужен | Только при заданном ключе |
| LLM | Необязательный локальный ассистент (раздел выше), по умолчанию выключен | Только при `AI_ENABLED=true` |

Реальные API, корпоративные системы и данные Альфа-Банка не используются.

## Данные

Демонстрационные компании, продукты, ставки, ответы ФНС/БКИ/финансовых источников, оценки и решения созданы для
проекта и полностью синтетические. Реальные персональные данные и данные реальных компаний не используются.
Датасет ML-модели сгенерирован `ml/generate_dataset.py`. Названия продуктов не являются продуктами какого-либо банка.
Название «Альфа-Банк» упоминается только в демо-переключателе «Я клиент / Я пока не клиент Альфа-Банка» и в
пояснениях о том, что реальные системы банка не используются; логотипы и фирменные знаки банка не используются.
