"""Trains Logistic Regression (baseline) and LightGBM on the synthetic dataset, selects the model on the validation
split and exports it for the API: compact tree JSON evaluated in TypeScript, plus SHAP fixtures for parity tests.

Split: train 70% / validation 15% / test 15%, stratified, fixed seed. The test split is used only by evaluate.py.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from common import ARTIFACTS, DATA, EXPORT, SPEC, column_names, encode, monotone_constraints

MODEL_VERSION = "lgbm-default12m-1.0.0"


def split(df: pd.DataFrame, seed: int):
    train, rest = train_test_split(df, test_size=0.30, stratify=df.default12m, random_state=seed)
    valid, test = train_test_split(rest, test_size=0.50, stratify=rest.default12m, random_state=seed)
    return train, valid, test


def fit_logreg(x: pd.DataFrame, y: pd.Series):
    model = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=5000))
    return model.fit(x, y)


def fit_lightgbm(x: pd.DataFrame, y: pd.Series, xv: pd.DataFrame, yv: pd.Series, seed: int) -> lgb.Booster:
    params = {
        "objective": "binary", "learning_rate": 0.05, "num_leaves": 15, "min_child_samples": 100, "feature_fraction": 0.9,
        "bagging_fraction": 0.8, "bagging_freq": 1, "lambda_l2": 1.0, "monotone_constraints": monotone_constraints(),
        "seed": seed, "deterministic": True, "force_row_wise": True, "num_threads": 1, "verbose": -1,
    }
    train = lgb.Dataset(x, y, feature_name=column_names(), free_raw_data=False)
    valid = lgb.Dataset(xv, yv, reference=train)
    return lgb.train(params, train, num_boost_round=2000, valid_sets=[valid],
                     callbacks=[lgb.early_stopping(100, verbose=False)])


def summary(y, p) -> dict:
    return {"rocAuc": round(roc_auc_score(y, p), 4), "prAuc": round(average_precision_score(y, p), 4), "brier": round(brier_score_loss(y, p), 5)}


def export_trees(booster: lgb.Booster) -> list[dict]:
    """Flattens LightGBM trees: node = [feature, threshold, left, right, cover]; child < 0 is leaf ~child; leaf = [value, cover]."""
    trees = []
    for info in booster.dump_model()["tree_info"]:
        nodes, leaves = [], []

        def walk(node) -> int:
            if "leaf_value" in node:
                leaves.append([node["leaf_value"], node.get("leaf_count", 0)])
                return ~(len(leaves) - 1)
            assert node["decision_type"] == "<=" and node["missing_type"] in ("None", "NaN"), node["decision_type"]
            index = len(nodes)
            nodes.append(None)
            left, right = walk(node["left_child"]), walk(node["right_child"])
            nodes[index] = [node["split_feature"], node["threshold"], left, right, node["internal_count"]]
            return index

        root = walk(info["tree_structure"])
        trees.append({"root": root, "nodes": nodes, "leaves": leaves})
    return trees


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    df = pd.read_csv(DATA / "synthetic_credit.csv")
    train, valid, test = split(df, args.seed)
    x, xv = encode(train), encode(valid)
    ARTIFACTS.mkdir(exist_ok=True)

    logreg = fit_logreg(x, train.default12m)
    booster = fit_lightgbm(x, train.default12m, xv, valid.default12m, args.seed)
    joblib.dump(logreg, ARTIFACTS / "logreg.joblib")
    booster.save_model(str(ARTIFACTS / "lightgbm.txt"))

    candidates = {"logistic_regression": summary(valid.default12m, logreg.predict_proba(xv)[:, 1]),
                  "lightgbm": summary(valid.default12m, booster.predict(xv))}
    # Selection rule: higher validation PR-AUC (rare positive class), Brier as the tie-breaker.
    selected = max(candidates, key=lambda name: (candidates[name]["prAuc"], -candidates[name]["brier"]))
    selection = {"validation": candidates, "selected": selected, "rule": "max validation PR-AUC, then min Brier",
                 "bestIteration": booster.best_iteration}
    (ARTIFACTS / "selection.json").write_text(json.dumps(selection, indent=2), encoding="utf-8")
    print(json.dumps(selection, indent=2))
    if selected != "lightgbm":
        raise SystemExit("Logistic regression won: export of a linear model is not implemented — review the data generator.")

    EXPORT.mkdir(parents=True, exist_ok=True)
    model = {
        "version": MODEL_VERSION, "kind": "lightgbm-binary", "target": SPEC["target"],
        "trainedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "seed": args.seed, "trainRows": len(train),
        "disclaimer": "Demo model trained on synthetic data. Not a model of any bank.",
        "columns": column_names(), "numeric": SPEC["numeric"], "categorical": SPEC["categorical"], "riskLevels": SPEC["riskLevels"],
        "trees": export_trees(booster),
    }
    (EXPORT / "risk-model.json").write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")

    # Parity fixtures: raw feature rows -> LightGBM probability and SHAP contributions (last column = expected value).
    sample = test.sample(25, random_state=args.seed)
    raw_columns = sorted({f["source"] for f in SPEC["numeric"]} | {c["name"] for c in SPEC["categorical"]})
    contrib = booster.predict(encode(sample), pred_contrib=True)
    fixtures = [{"features": {k: (v.item() if hasattr(v, "item") else v) for k, v in row[raw_columns].items()},
                 "probability": float(p), "contributions": [float(c) for c in cs]}
                for (_, row), p, cs in zip(sample.iterrows(), booster.predict(encode(sample)), contrib)]
    (EXPORT / "risk-model.fixtures.json").write_text(json.dumps({"version": MODEL_VERSION, "rows": fixtures}), encoding="utf-8")
    print(f"exported {MODEL_VERSION}: {booster.num_trees()} trees -> {EXPORT}")


if __name__ == "__main__":
    main()
