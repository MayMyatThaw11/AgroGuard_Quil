from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Mapping
from typing import Any

import numpy as np

LAGS = 5
TREND_YEARS = 10
MIN_YEARS = 20
HIDDEN = 8
EPOCHS = 3000
LEARNING_RATE = 0.05
WEIGHT_DECAY = 1e-3
SEED = 7
MIN_PROMOTION_PAIRS = 30
BASELINE = "mean_5y"
METHOD = (
    "One-step-ahead national yield forecasts at rolling origins: each test year is predicted "
    "from earlier years only, and every neural model is retrained at each origin on samples "
    "whose target year is before it. Hit rates within 5 % and 10 % were fixed before the run."
)

Series = Mapping[int, float]


def _logs(s: Series, before: int) -> np.ndarray:
    return np.log(np.array([s[y] for y in sorted(s) if y < before], dtype=float))


def _trend(logs: np.ndarray) -> float:
    tail = logs[-TREND_YEARS:]
    slope, intercept = np.polyfit(np.arange(len(tail)), tail, 1)
    return float(intercept + slope * len(tail))


def _features(logs: np.ndarray) -> np.ndarray:
    return np.diff(logs)[-LAGS:]


def _samples(
    data: Mapping[str, Series], before: int, residual: bool
) -> tuple[np.ndarray, np.ndarray]:
    xs, ys = [], []
    for s in data.values():
        logs = _logs(s, before)
        for end in range(max(LAGS + 1, TREND_YEARS), len(logs)):
            past = logs[:end]
            xs.append(_features(past))
            ys.append(logs[end] - (_trend(past) if residual else past[-1]))
    return np.array(xs), np.array(ys)


def _fit(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, ...]:
    """One hidden tanh layer, full-batch gradient descent with L2; seeded so runs replicate."""
    rng = np.random.default_rng(SEED)
    mu, sd = x.mean(0), x.std(0) + 1e-9
    xn = (x - mu) / sd
    w1 = rng.normal(0, 0.3, (x.shape[1], HIDDEN))
    b1 = np.zeros(HIDDEN)
    w2 = rng.normal(0, 0.3, HIDDEN)
    b2 = 0.0
    n = len(y)
    for _ in range(EPOCHS):
        h = np.tanh(xn @ w1 + b1)
        err = h @ w2 + b2 - y
        gw2 = h.T @ err / n + WEIGHT_DECAY * w2
        gb2 = err.mean()
        gh = np.outer(err, w2) * (1 - h**2)
        gw1 = xn.T @ gh / n + WEIGHT_DECAY * w1
        gb1 = gh.mean(0)
        w1, b1, w2, b2 = (
            w1 - LEARNING_RATE * gw1,
            b1 - LEARNING_RATE * gb1,
            w2 - LEARNING_RATE * gw2,
            b2 - LEARNING_RATE * gb2,
        )
    return mu, sd, w1, b1, w2, np.array(b2)


def _apply(model: tuple[np.ndarray, ...], x: np.ndarray) -> float:
    mu, sd, w1, b1, w2, b2 = model
    return float(np.tanh(((x - mu) / sd) @ w1 + b1) @ w2 + b2)


def _score(errors: list[float]) -> dict[str, Any]:
    pct = np.abs(np.array(errors)) * 100
    return {
        "pairs": len(errors),
        "mape_pct": round(float(pct.mean()), 3) if errors else None,
        "within_5_pct": round(float((pct <= 5).mean()), 3) if errors else None,
        "within_10_pct": round(float((pct <= 10).mean()), 3) if errors else None,
    }


def _digest(data: Mapping[str, Series]) -> str:
    rows = {k: {str(y): round(v, 4) for y, v in sorted(s.items())} for k, s in sorted(data.items())}
    return "sha256:" + hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()


def backtest(data: Mapping[str, Series], test_years: Iterable[int]) -> dict[str, Any]:
    names = ("persistence", "mean_5y", "linear_trend", "mlp_growth", "hybrid_trend_mlp")
    errors: dict[str, list[float]] = {n: [] for n in names}
    pairs: list[dict[str, Any]] = []
    skipped: dict[str, str] = {}
    for year in test_years:
        usable = {k: s for k, s in data.items() if year in s and len(_logs(s, year)) >= MIN_YEARS}
        for k in data:
            if k not in usable and k not in skipped:
                skipped[k] = f"fewer than {MIN_YEARS} earlier years or no value for a test year"
        if not usable:
            continue
        growth = _fit(*_samples(usable, year, residual=False))
        residual = _fit(*_samples(usable, year, residual=True))
        for k, s in usable.items():
            logs = _logs(s, year)
            guess = {
                "persistence": logs[-1],
                "mean_5y": float(np.log(np.mean(np.exp(logs[-5:])))),
                "linear_trend": _trend(logs),
                "mlp_growth": logs[-1] + _apply(growth, _features(logs)),
                "hybrid_trend_mlp": _trend(logs) + _apply(residual, _features(logs)),
            }
            actual = s[year]
            row: dict[str, Any] = {"country": k, "year": year, "actual": round(actual, 1)}
            for name, value in guess.items():
                predicted = float(np.exp(value))
                errors[name].append((predicted - actual) / actual)
                row[name] = round(predicted, 1)
            pairs.append(row)
    scores = {n: _score(e) for n, e in errors.items()}
    base = scores[BASELINE]["mape_pct"]
    best = min(
        (n for n in names if scores[n]["mape_pct"] is not None),
        key=lambda n: scores[n]["mape_pct"],
        default=BASELINE,
    )
    promoted = (
        best != BASELINE
        and base is not None
        and scores[best]["pairs"] >= MIN_PROMOTION_PAIRS
        and scores[best]["mape_pct"] < base
    )
    return {
        "scores": scores,
        "baseline": BASELINE,
        "chosen": best if promoted else BASELINE,
        "promotion_rule": f"replace the 5-year mean only with a lower MAPE on "
        f"{MIN_PROMOTION_PAIRS}+ held-out pairs",
        "pairs_total": len(pairs),
        "pairs": pairs,
        "skipped": skipped,
        "method": METHOD,
        "seed": SEED,
        "data_sha256": _digest(data),
    }


def faostat_rice(countries: Iterable[str]) -> dict[str, dict[int, float]]:
    from .data import fao_pack

    out: dict[str, dict[int, float]] = {}
    for code in countries:
        iso3 = fao_pack.resolve_country(code)
        rows = fao_pack.faostat_qcl(iso3, "Rice", "Yield").get("records", [])
        values = {r["year"]: float(r["value"]) for r in rows if r["value"] and r["unit"] == "kg/ha"}
        if values:
            out[iso3] = values
    return out
