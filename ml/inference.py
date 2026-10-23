"""Scores one application with the exported model, the same way the API does (miniapp/api-server/credit/ml-model.ts).

    python inference.py '{"businessAgeMonths": 91, "legalForm": "OOO", ...}'
    python inference.py --check   # parity: exported JSON vs LightGBM on the SHAP fixtures

Output: probability of default12m, riskLevel and top SHAP factors. The model never makes the credit decision.
"""
from __future__ import annotations

import json
import math
import sys

import pandas as pd

from common import ARTIFACTS, EXPORT, encode, risk_level

MODEL = json.loads((EXPORT / "risk-model.json").read_text(encoding="utf-8"))


def raw_score(row: list[float]) -> float:
    total = 0.0
    for tree in MODEL["trees"]:
        node = tree["root"]
        while node >= 0:
            feature, threshold, left, right, _ = tree["nodes"][node]
            node = left if row[feature] <= threshold else right
        total += tree["leaves"][~node][0]
    return total


def predict(features: dict) -> dict:
    row = encode(pd.DataFrame([features])).iloc[0].tolist()
    probability = 1 / (1 + math.exp(-raw_score(row)))
    result = {"modelVersion": MODEL["version"], "probability": round(probability, 4), "riskLevel": risk_level(probability)}
    booster_file = ARTIFACTS / "lightgbm.txt"
    if booster_file.exists():  # SHAP from LightGBM itself (the API computes the same values with TreeSHAP in TypeScript)
        import lightgbm as lgb
        contributions = lgb.Booster(model_file=str(booster_file)).predict(encode(pd.DataFrame([features])), pred_contrib=True)[0][:-1]
        grouped: dict[str, float] = {}
        for name, value in zip(MODEL["columns"], contributions):
            grouped[name.split("=")[0]] = grouped.get(name.split("=")[0], 0.0) + float(value)
        top = sorted(grouped.items(), key=lambda kv: -abs(kv[1]))[:5]
        result["topFactors"] = [{"feature": k, "impact": "negative" if v > 0 else "positive", "shap": round(v, 4)} for k, v in top]
    return result


def check() -> None:
    fixtures = json.loads((EXPORT / "risk-model.fixtures.json").read_text(encoding="utf-8"))["rows"]
    worst = max(abs(predict(f["features"])["probability"] - f["probability"]) for f in fixtures)
    print(f"{len(fixtures)} fixtures, max |probability difference| {worst:.6f}")
    if worst > 1e-4:
        raise SystemExit("exported model does not reproduce LightGBM")


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        check()
    elif len(sys.argv) == 2:
        print(json.dumps(predict(json.loads(sys.argv[1])), ensure_ascii=False, indent=2))
    else:
        raise SystemExit(__doc__)
