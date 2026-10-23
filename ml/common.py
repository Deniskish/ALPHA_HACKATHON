"""Shared helpers: feature spec, encoding of raw rows into the model matrix (same rules as the TypeScript inference)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
SPEC = json.loads((ROOT / "feature_spec.json").read_text(encoding="utf-8"))
DATA = ROOT / "data"
REPORTS = ROOT / "reports"
ARTIFACTS = ROOT / "artifacts"
# Exported model consumed by the API (inside the Docker build context).
EXPORT = ROOT.parent / "miniapp" / "api-server" / "credit" / "model"


def column_names() -> list[str]:
    names = [f["name"] for f in SPEC["numeric"]]
    for cat in SPEC["categorical"]:
        names += [f"{cat['name']}={value}" for value in cat["categories"]]
    return names


def encode(raw: pd.DataFrame) -> pd.DataFrame:
    """Raw business features (as produced by the API Feature Builder) -> numeric model matrix."""
    out: dict[str, np.ndarray] = {}
    for f in SPEC["numeric"]:
        x = raw[f["source"]].astype(float).to_numpy()
        if f.get("transform") == "log10":
            x = np.log10(np.maximum(x, 1.0))
        if "clip" in f:
            x = np.clip(x, *f["clip"])
        out[f["name"]] = x
    for cat in SPEC["categorical"]:
        values = raw[cat["name"]].astype(str).to_numpy()
        for value in cat["categories"]:
            out[f"{cat['name']}={value}"] = (values == value).astype(float)
    return pd.DataFrame(out, columns=column_names())


def monotone_constraints() -> list[int]:
    numeric = [f.get("monotone", 0) for f in SPEC["numeric"]]
    return numeric + [0] * (len(column_names()) - len(numeric))


def risk_level(p: float) -> str:
    levels = SPEC["riskLevels"]
    return "HIGH" if p >= levels["highFrom"] else "MEDIUM" if p >= levels["mediumFrom"] else "LOW"
