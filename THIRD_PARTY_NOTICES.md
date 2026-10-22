# Third-party notices

Проект использует перечисленные ниже сторонние компоненты. Версии — из `package-lock.json` на момент подготовки
MVP. Полные тексты лицензий находятся в соответствующих пакетах (`node_modules/<package>/LICENSE`) и по ссылкам.
Транзитивные зависимости распространяются на условиях своих лицензий и перечислены в `package-lock.json`.

## Frontend (`miniapp/package.json`)

| Компонент | Версия | Лицензия | Назначение |
|---|---|---|---|
| react, react-dom | 18.3.1 | MIT | UI |
| @fontsource-variable/manrope | 5.3.0 | SIL Open Font License 1.1 | Шрифт Manrope |
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

## Среда выполнения и образы

| Компонент | Лицензия |
|---|---|
| Node.js 22 (включая встроенный SQLite, `node:sqlite`) | MIT; SQLite — public domain |
| Docker-образ `node:22-bookworm-slim` | Node.js — MIT; Debian — лицензии пакетов дистрибутива |
| Docker-образ `nginx:1.28-alpine` | nginx — BSD-2-Clause; Alpine — лицензии пакетов дистрибутива |

## Данные

Демонстрационные компании, продукты, ставки, ответы ФНС/БКИ/финансовых источников, оценки и решения созданы для
проекта и полностью синтетические. Реальные персональные данные и данные реальных компаний не используются.
Названия продуктов не являются продуктами какого-либо банка; товарные знаки третьих лиц в интерфейсе не используются.
