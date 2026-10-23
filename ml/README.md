# ML Risk Model (демо)

Офлайн-обучение отдельной модели риска для «Опоры». Модель оценивает вероятность события `default12m`
(проблемное обслуживание в течение 12 месяцев) по данным заявки. **Это демо-модель на синтетических данных, а не
банковская модель Альфа-Банка или другого банка. Решение по заявке она не принимает.**

API не нуждается в Python: `train.py` экспортирует деревья в `miniapp/api-server/credit/model/risk-model.json`, а
`credit/ml-model.ts` исполняет их и считает точный TreeSHAP. Паритет с LightGBM проверяется тестом на фикстурах.

## Файлы

| Файл | Назначение |
|---|---|
| `feature_spec.json` | Общий контракт признаков Python ↔ TypeScript: источник, преобразование, ограничения монотонности, подписи |
| `common.py` | Кодирование сырых признаков в матрицу модели (то же правило, что `encodeFeatures` в API) |
| `generate_dataset.py` | Синтетический датасет 30–100 тыс. строк, воспроизводимый по `--seed` |
| `train.py` | Logistic Regression и LightGBM, выбор на валидации, экспорт модели и SHAP-фикстур |
| `evaluate.py` | Метрики на отложенной выборке → `reports/metrics.json` |
| `inference.py` | Оценка одной заявки экспортированной моделью; `--check` — паритет с LightGBM |
| `requirements.txt` | Версии, с которыми получены метрики |

`data/` и `artifacts/` не хранятся в git: они пересоздаются командами ниже.

## Запуск

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python generate_dataset.py            # --rows 60000 --seed 2026 по умолчанию
python train.py                       # artifacts/, экспорт в miniapp/api-server/credit/model/
python evaluate.py                    # reports/metrics.json
python inference.py --check           # экспорт = LightGBM
python inference.py '{"businessAgeMonths": 91, "legalForm": "OOO", "industry": "manufacturing", "region": "large",
  "employees": 42, "annualRevenue": 48000000, "profitMargin": 0.175, "debtToRevenue": 0.083, "activeLoans": 2,
  "latePayments12m": 0, "maxOverdueDays": 0, "overdueToRevenue": 0, "amountToRevenue": 0.0625,
  "requestedTermMonths": 12, "paymentToProfit": 0.4, "keyRate": 16, "purpose": "WORKING_CAPITAL"}'
```

После переобучения запустите `npm test --prefix miniapp/api-server`: тест паритета сверит TypeScript-инференс
с новыми фикстурами.

## Результат текущей версии (`lgbm-default12m-1.0.0`)

60 000 строк, доля `default12m` 7,9%, тест — 9 000 строк.

| Модель | ROC-AUC | PR-AUC | Brier | Precision / Recall @0,20 |
|---|---|---|---|---|
| Logistic Regression | 0,874 | 0,482 | 0,0543 | 0,36 / 0,59 |
| LightGBM | 0,876 | 0,481 | 0,0542 | 0,36 / 0,59 |
| Потолок (истинная латентная вероятность генератора) | 0,896 | 0,531 | — | — |

Разница моделей статистически не значима (bootstrap 95% ДИ разницы ROC-AUC: −0,002…+0,004). Подробности, выбор
модели и объяснимость — [docs/ml-risk-model.md](../docs/ml-risk-model.md).
