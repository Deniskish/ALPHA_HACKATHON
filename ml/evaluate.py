"""Evaluates both models on the held-out test split and writes reports/metrics.json.

Metrics for a binary default target: ROC-AUC, PR-AUC, Brier, log-loss, precision / recall / F1 and confusion matrices
at two thresholds (the decision-policy caution threshold and the F1-optimal threshold chosen on validation),
calibration by deciles, bootstrap confidence intervals, feature importance and mean |SHAP|.
Accuracy is reported only as a reference: with ~8% positives it is misleading. WAPE is not applicable.
"""
from __future__ import annotations

import json

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import (accuracy_score, average_precision_score, brier_score_loss, confusion_matrix, f1_score, log_loss,
                             precision_recall_curve, precision_score, recall_score, roc_auc_score)

from common import ARTIFACTS, DATA, REPORTS, SPEC, column_names, encode
from train import split

SEED = 2026
POLICY_THRESHOLD = SPEC["riskLevels"]["highFrom"]  # decision engine: ML caution from this probability


def at_threshold(y, p, threshold: float) -> dict:
    predicted = (p >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, predicted, labels=[0, 1]).ravel()
    return {"threshold": round(float(threshold), 4), "precision": round(precision_score(y, predicted, zero_division=0), 4),
            "recall": round(recall_score(y, predicted), 4), "f1": round(f1_score(y, predicted), 4),
            "flaggedShare": round(float(predicted.mean()), 4), "accuracyReferenceOnly": round(accuracy_score(y, predicted), 4),
            "confusionMatrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}}


def f1_threshold(y, p) -> float:
    precision, recall, thresholds = precision_recall_curve(y, p)
    f1 = 2 * precision * recall / np.maximum(precision + recall, 1e-12)
    return float(thresholds[np.argmax(f1[:-1])])


def calibration(y, p, bins: int = 10) -> list[dict]:
    frame = pd.DataFrame({"y": np.asarray(y), "p": p})
    frame["bin"] = pd.qcut(frame.p, bins, labels=False, duplicates="drop")
    rows = frame.groupby("bin").agg(meanPredicted=("p", "mean"), observedRate=("y", "mean"), count=("y", "size"))
    return [{k: (round(float(v), 4) if k != "count" else int(v)) for k, v in row.items()} for _, row in rows.iterrows()]


def bootstrap(y, p_a, p_b, rounds: int = 500) -> dict:
    rng = np.random.default_rng(SEED)
    y = np.asarray(y)
    stats = {"rocAuc": [], "prAuc": []}
    for _ in range(rounds):
        idx = rng.integers(0, len(y), len(y))
        if y[idx].sum() == 0:
            continue
        stats["rocAuc"].append(roc_auc_score(y[idx], p_b[idx]) - roc_auc_score(y[idx], p_a[idx]))
        stats["prAuc"].append(average_precision_score(y[idx], p_b[idx]) - average_precision_score(y[idx], p_a[idx]))
    return {k: {"meanDiff": round(float(np.mean(v)), 4), "ci95": [round(float(np.percentile(v, 2.5)), 4), round(float(np.percentile(v, 97.5)), 4)]}
            for k, v in stats.items()}


def grouped(values: np.ndarray) -> dict:
    """Sums per-column values into business features (one-hot columns -> their categorical feature)."""
    out: dict[str, float] = {}
    for name, value in zip(column_names(), values):
        key = name.split("=")[0]
        out[key] = out.get(key, 0.0) + float(value)
    return dict(sorted(((k, round(v, 5)) for k, v in out.items()), key=lambda kv: -kv[1]))


def report(name: str, y, p, threshold: float) -> dict:
    return {"model": name, "rocAuc": round(roc_auc_score(y, p), 4), "prAuc": round(average_precision_score(y, p), 4),
            "brier": round(brier_score_loss(y, p), 5), "logLoss": round(log_loss(y, p), 5), "meanPredicted": round(float(np.mean(p)), 4),
            "atPolicyThreshold": at_threshold(y, p, POLICY_THRESHOLD), "atF1Threshold": at_threshold(y, p, threshold),
            "calibration": calibration(y, p)}


def main() -> None:
    df = pd.read_csv(DATA / "synthetic_credit.csv")
    _, valid, test = split(df, SEED)
    xv, xt, y = encode(valid), encode(test), test.default12m.to_numpy()
    logreg = joblib.load(ARTIFACTS / "logreg.joblib")
    booster = lgb.Booster(model_file=str(ARTIFACTS / "lightgbm.txt"))
    selection = json.loads((ARTIFACTS / "selection.json").read_text(encoding="utf-8"))

    p_lr, p_gb = logreg.predict_proba(xt)[:, 1], booster.predict(xt)
    shap = booster.predict(xt, pred_contrib=True)[:, :-1]
    coefficients = logreg[-1].coef_[0]
    metrics = {
        "dataset": {"rows": len(df), "testRows": len(test), "defaultRate": round(float(df.default12m.mean()), 4), "seed": SEED,
                    "split": "train 70% / validation 15% / test 15%, stratified"},
        # Upper bound: the generator's own latent probability (unknown in reality) scored on the same test rows.
        "oracleCeiling": {"rocAuc": round(roc_auc_score(y, test.latentProbability), 4), "prAuc": round(average_precision_score(y, test.latentProbability), 4)},
        "models": {"logistic_regression": report("Logistic Regression (standardized, L2)", y, p_lr, f1_threshold(valid.default12m, logreg.predict_proba(xv)[:, 1])),
                   "lightgbm": report("LightGBM (monotone constraints)", y, p_gb, f1_threshold(valid.default12m, booster.predict(xv)))},
        "comparison": {"lightgbmMinusLogreg": bootstrap(y, p_lr, p_gb), "bootstrapRounds": 500},
        "selection": selection,
        "explainability": {
            "lightgbmGainImportance": grouped(booster.feature_importance("gain") / booster.feature_importance("gain").sum()),
            "lightgbmMeanAbsShap": grouped(np.abs(shap).mean(axis=0)),
            "logregStandardizedCoefficients": dict(sorted(((n, round(float(c), 4)) for n, c in zip(column_names(), coefficients)), key=lambda kv: -abs(kv[1]))[:12]),
        },
        "notes": ["Synthetic data, demo model: not a bank model and not a bank's risk policy.",
                  "Accuracy is shown only for reference; with ~8% positives it is not a meaningful quality metric.",
                  "WAPE is a regression/forecast metric and is not used for a binary default target."],
    }
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "metrics.json").write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")
    for key, m in metrics["models"].items():
        print(f"{key:20} ROC-AUC {m['rocAuc']}  PR-AUC {m['prAuc']}  Brier {m['brier']}  "
              f"F1@{m['atF1Threshold']['threshold']} {m['atF1Threshold']['f1']}  P/R@{POLICY_THRESHOLD} "
              f"{m['atPolicyThreshold']['precision']}/{m['atPolicyThreshold']['recall']}")
    print("oracle", metrics["oracleCeiling"], "diff", metrics["comparison"]["lightgbmMinusLogreg"])
    print("mean|SHAP|", list(metrics["explainability"]["lightgbmMeanAbsShap"].items())[:8])


if __name__ == "__main__":
    main()
