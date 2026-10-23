"""Synthetic dataset for the demo default model (target default12m).

Every row is a fictional small business with a loan request. A latent default probability is built from several
business factors plus an unobserved "quality" component and noise; the binary target is then sampled from it,
so the data is noisy like real credit data and no model can reach a perfect score. Reproducible by --seed.
This is NOT bank data and the coefficients are NOT any bank's risk policy.
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from common import DATA, SPEC

PURPOSES = SPEC["categorical"][3]["categories"]
INDUSTRIES = SPEC["categorical"][1]["categories"]


def annuity(amount: np.ndarray, annual_rate: np.ndarray, months: np.ndarray) -> np.ndarray:
    r = annual_rate / 100 / 12
    return amount * r / (1 - (1 + r) ** -months)


def generate(n: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    industry = rng.choice(INDUSTRIES, n, p=[0.07, 0.14, 0.12, 0.22, 0.10, 0.09, 0.10, 0.16])
    industry_risk = np.array([SPEC["industryRisk"][i] for i in industry])
    legal_form = rng.choice(["OOO", "AO", "IP", "OTHER"], n, p=[0.55, 0.03, 0.38, 0.04])
    region = rng.choice(["capital", "large", "other"], n, p=[0.30, 0.35, 0.35])
    age = np.clip(np.round(rng.lognormal(np.log(48), 0.9, n)), 3, 360)
    quality = rng.normal(0, 1, n)  # unobserved management quality; leaks into margin and payment discipline only partially

    employees = np.maximum(1, np.round(rng.lognormal(np.log(3 + age / 12 * 1.5), 0.8, n)))
    revenue = np.clip(np.exp(np.log(6e6) + 0.35 * np.log(age / 12 + 1) + 0.25 * np.log(employees) + rng.normal(0, 0.7, n)), 5e5, 2e9)
    margin = np.clip(rng.normal(0.13 - 0.12 * (industry_risk - 1) + 0.035 * quality, 0.08), -0.3, 0.5)
    profit = revenue * margin
    has_debt = rng.random(n) > 0.25
    debt_to_revenue = np.where(has_debt, np.clip(np.exp(rng.normal(np.log(0.12) - 0.15 * quality, 0.8, n)), 0, 2), 0.0)
    active_loans = np.where(has_debt, 1 + rng.poisson(np.minimum(debt_to_revenue * 4, 6)), 0)
    late = np.where(has_debt, np.clip(rng.poisson(np.exp(-1.8 - 0.9 * quality + 1.2 * np.minimum(debt_to_revenue, 2))), 0, 12), 0)
    max_overdue = np.where(late > 0, np.clip(np.round(rng.lognormal(np.log(8 + 6 * late), 0.8)), 1, 365), 0)
    overdue_amount = np.where(max_overdue > 30, debt_to_revenue * revenue * rng.uniform(0.05, 0.4, n), 0.0)

    purpose = rng.choice(PURPOSES, n, p=[0.34, 0.14, 0.09, 0.10, 0.07, 0.09, 0.07, 0.10])
    long_purpose = np.isin(purpose, ["EQUIPMENT", "NEW_LOCATION", "EXPANSION", "INVESTMENT_PROJECT", "REFINANCING"])
    term = np.where(long_purpose, rng.choice([12, 24, 36, 48, 60], n), rng.choice([3, 6, 12, 18, 24], n))
    amount_to_revenue = np.clip(np.exp(rng.normal(np.log(0.07), 0.7, n)), 0.005, 1.5)
    amount = np.round(revenue * amount_to_revenue, -4)
    key_rate = rng.choice([7.5, 9.5, 12.0, 16.0, 18.0, 21.0], n, p=[0.12, 0.12, 0.2, 0.3, 0.16, 0.1])
    rate = key_rate + np.where(long_purpose, 2.0, 3.5) + rng.uniform(0, 3, n)
    payment = annuity(amount, rate, term)
    payment_to_profit = np.where(profit > 0, payment / np.maximum(profit / 12, 1), 10.0)

    logit = (
        -4.95
        + 0.9 * np.exp(-age / 18)
        - 0.08 * np.log1p(employees)
        - 4.0 * margin
        + 1.6 * np.minimum(debt_to_revenue, 1.5)
        + 0.35 * np.minimum(late, 6)
        + 0.012 * np.minimum(max_overdue, 180)
        + 6.0 * np.minimum(overdue_amount / revenue, 0.3)
        + 0.9 * np.minimum(payment_to_profit, 3)
        + 0.6 * np.minimum(amount_to_revenue, 1.5)
        + 1.5 * (industry_risk - 1)
        + np.select([region == "other", region == "capital"], [0.1, -0.05], 0.0)
        + np.select([legal_form == "IP", legal_form == "OTHER"], [0.1, 0.2], 0.0)
        + 0.06 * (key_rate - 12)
        + np.select([purpose == "REFINANCING", purpose == "YOUNG_BUSINESS", purpose == "INVESTMENT_PROJECT", purpose == "OTHER"],
                    [0.25, 0.2, 0.15, 0.15], 0.0)
        - 0.6 * quality
        + rng.normal(0, 0.35, n)
    )
    probability = 1 / (1 + np.exp(-logit))
    default12m = (rng.random(n) < probability).astype(int)

    return pd.DataFrame({
        "businessAgeMonths": age.astype(int), "legalForm": legal_form, "industry": industry, "region": region,
        "employees": employees.astype(int), "annualRevenue": np.round(revenue, -3), "annualExpenses": np.round(revenue - profit, -3),
        "annualProfit": np.round(profit, -3), "profitMargin": margin.round(4), "currentDebt": np.round(debt_to_revenue * revenue, -3),
        "debtToRevenue": debt_to_revenue.round(4), "activeLoans": active_loans, "latePayments12m": late,
        "maxOverdueDays": max_overdue.astype(int), "overdueAmount": np.round(overdue_amount, -3),
        "overdueToRevenue": (overdue_amount / revenue).round(5), "requestedAmount": amount, "requestedTermMonths": term,
        "purpose": purpose, "amountToRevenue": amount_to_revenue.round(4), "estimatedPayment": payment.round(0),
        "paymentToProfit": np.minimum(payment_to_profit, 10).round(4), "keyRate": key_rate,
        # Kept only for analysis of the generator; never used as a model feature.
        "latentProbability": probability.round(5), "default12m": default12m,
    })


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=int, default=60_000)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    if not 30_000 <= args.rows <= 100_000:
        parser.error("--rows must be between 30 000 and 100 000")
    df = generate(args.rows, args.seed)
    DATA.mkdir(exist_ok=True)
    path = DATA / "synthetic_credit.csv"
    df.to_csv(path, index=False)
    print(f"{len(df)} rows -> {path}; default12m rate {df.default12m.mean():.3%}; mean latent p {df.latentProbability.mean():.3%}")


if __name__ == "__main__":
    main()
