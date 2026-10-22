from __future__ import annotations

import math
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np

try:
    import torch
    from torch import nn

    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False

PERSISTENCE = "persistence"
DAMPED_TREND = "damped-trend"
WATER_BALANCE = "water-balance-regression"
HYBRID = "water-balance+tcn-residual"
METHOD_FALLBACK = "damped-trend-fallback"

WINDOW_DAYS = 14
Z90 = 1.2816
QUANTILES = (0.1, 0.5, 0.9)
ALPHA = 0.2
MIN_PROMOTION_PAIRS = 30
EVENT_JUMP_CM = 2.0


@dataclass(frozen=True)
class SeriesInput:
    id: str
    target: Sequence[float]


@dataclass(frozen=True)
class ForecastConfig:
    horizon: int = 10
    window: int = WINDOW_DAYS
    hidden: int = 16
    epochs: int = 120
    recency_half_life_days: float = 10.0
    min_neural_windows: int = 200
    learning_rate: float = 0.01
    weight_decay: float = 1e-3
    dropout: float = 0.15
    mc_samples: int = 32
    seed: int = 7


def _finite(values: Sequence[float], name: str) -> np.ndarray:
    arr = np.asarray(values, dtype=np.float64)
    if arr.ndim != 1 or not np.all(np.isfinite(arr)):
        raise ValueError(f"{name} must be a one-dimensional list of finite numbers")
    return arr


def management_events(target: np.ndarray, rain: np.ndarray) -> np.ndarray:
    rises = np.diff(target, prepend=target[0]) - rain / 10.0
    return rises > EVENT_JUMP_CM


@dataclass(frozen=True)
class _WaterBalance:
    rain_gain: float
    dry_gain: float
    intercepts: np.ndarray
    ceilings: np.ndarray
    sigma: float

    def roll(self, index: int, last: float, rain: np.ndarray) -> np.ndarray:
        out = np.empty(len(rain))
        level = last
        for step, r in enumerate(rain):
            level += self.rain_gain * r + self.intercepts[index] + self.dry_gain * (level < 0)
            level = min(level, self.ceilings[index])
            out[step] = level
        return out


def _fit_water_balance(
    targets: list[np.ndarray], rain: np.ndarray, half_life: float
) -> _WaterBalance:
    rows: list[np.ndarray] = []
    ys: list[float] = []
    weights: list[float] = []
    count = len(targets)
    for i, target in enumerate(targets):
        events = management_events(target, rain)
        last = len(target) - 1
        for t in range(1, len(target)):
            if events[t]:
                continue
            row = np.zeros(2 + count)
            row[0] = rain[t]
            row[1] = float(target[t - 1] < 0)
            row[2 + i] = 1.0
            rows.append(row)
            ys.append(target[t] - target[t - 1])
            weights.append(0.5 ** ((last - t) / half_life))
    x = np.asarray(rows)
    y = np.asarray(ys)
    w = np.asarray(weights)
    ridge = 1e-3 * np.eye(x.shape[1])
    coef = np.linalg.solve(x.T @ (x * w[:, None]) + ridge, x.T @ (y * w))
    residual = y - x @ coef
    return _WaterBalance(
        rain_gain=float(coef[0]),
        dry_gain=float(coef[1]),
        intercepts=coef[2:],
        ceilings=np.asarray([float(t.max()) for t in targets]),
        sigma=float(residual.std()) if len(residual) > 1 else 0.5,
    )


def _damped(target: np.ndarray, horizon: int) -> np.ndarray:
    recent = target[-7:]
    slope = float(np.polyfit(np.arange(len(recent)), recent, 1)[0]) if len(recent) > 1 else 0.0
    return target[-1] + slope * np.cumsum(0.85 ** np.arange(1, horizon + 1))


if _TORCH_AVAILABLE:

    class _ResidualNet(nn.Module):
        def __init__(self, hidden: int, horizon: int, dropout: float, outputs: int = 1) -> None:
            super().__init__()
            self.horizon, self.outputs = horizon, outputs
            self.encoder = nn.Sequential(
                nn.Conv1d(3, hidden, kernel_size=3, padding=2, dilation=1),
                nn.GELU(),
                nn.Conv1d(hidden, hidden, kernel_size=3, padding=4, dilation=2),
                nn.GELU(),
                nn.Conv1d(hidden, hidden, kernel_size=3, padding=8, dilation=4),
                nn.GELU(),
            )
            self.head = nn.Sequential(
                nn.Linear(hidden + 2 * horizon, 48),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(48, horizon * outputs),
            )

        def forward(self, history: torch.Tensor, future: torch.Tensor) -> torch.Tensor:
            features = self.encoder(history.transpose(1, 2))[:, :, history.shape[1] - 1]
            out = self.head(torch.cat([features, future], dim=1))
            return out if self.outputs == 1 else out.view(-1, self.horizon, self.outputs)

    def pinball_loss(pred: torch.Tensor, truth: torch.Tensor) -> torch.Tensor:
        """Mean quantile loss over QUANTILES; pred is (batch, horizon, len(QUANTILES))."""
        q = torch.tensor(QUANTILES, dtype=pred.dtype)
        err = truth.unsqueeze(-1) - pred
        return torch.maximum(q * err, (q - 1) * err).mean()


@dataclass(frozen=True)
class _Hybrid:
    model: Any
    scale: float
    rain_scale: float


def _hybrid_inputs(
    target: np.ndarray,
    rain_hist: np.ndarray,
    temp_hist: np.ndarray,
    rain_future: np.ndarray,
    physics: np.ndarray,
    cfg: ForecastConfig,
    scale: float,
    rain_scale: float,
) -> tuple[np.ndarray, np.ndarray]:
    w = cfg.window
    centre = target[-1]
    hist = np.stack(
        [
            (target[-w:] - centre) / scale,
            rain_hist[-w:] / rain_scale,
            (temp_hist[-w:] - 27.0) / 3.0,
        ],
        axis=1,
    )
    future = np.concatenate([rain_future / rain_scale, (physics - centre) / scale])
    return hist, future


def _train_hybrid(
    targets: list[np.ndarray],
    rain: np.ndarray,
    temp: np.ndarray,
    wb: _WaterBalance,
    cfg: ForecastConfig,
    quantile: bool = False,
) -> tuple[_Hybrid | None, int]:
    scale = max(float(np.std(np.concatenate(targets))), 1.0)
    rain_scale = max(float(rain.std()), 1.0)
    xs: list[np.ndarray] = []
    fs: list[np.ndarray] = []
    ys: list[np.ndarray] = []
    for i, target in enumerate(targets):
        events = management_events(target, rain)
        for t in range(cfg.window, len(target) - cfg.horizon + 1):
            if events[t : t + cfg.horizon].any():
                continue
            physics = wb.roll(i, target[t - 1], rain[t : t + cfg.horizon])
            hist, future = _hybrid_inputs(
                target[:t],
                rain[:t],
                temp[:t],
                rain[t : t + cfg.horizon],
                physics,
                cfg,
                scale,
                rain_scale,
            )
            xs.append(hist)
            fs.append(future)
            ys.append((target[t : t + cfg.horizon] - physics) / scale)
    if len(xs) < cfg.min_neural_windows:
        return None, len(xs)
    torch.manual_seed(cfg.seed)
    model = _ResidualNet(cfg.hidden, cfg.horizon, cfg.dropout, len(QUANTILES) if quantile else 1)
    optimiser = torch.optim.AdamW(
        model.parameters(), lr=cfg.learning_rate, weight_decay=cfg.weight_decay
    )
    xt = torch.tensor(np.asarray(xs), dtype=torch.float32)
    ft = torch.tensor(np.asarray(fs), dtype=torch.float32)
    yt = torch.tensor(np.asarray(ys), dtype=torch.float32)
    loss_fn = pinball_loss if quantile else nn.SmoothL1Loss()
    model.train()
    for _ in range(cfg.epochs):
        optimiser.zero_grad()
        loss = loss_fn(model(xt, ft), yt)
        loss.backward()
        optimiser.step()
    return _Hybrid(model, scale, rain_scale), len(xs)


def _hybrid_predict(
    hybrid: _Hybrid,
    target: np.ndarray,
    rain_hist: np.ndarray,
    temp_hist: np.ndarray,
    rain_future: np.ndarray,
    physics: np.ndarray,
    cfg: ForecastConfig,
    samples: int,
) -> np.ndarray:
    hist, future = _hybrid_inputs(
        target, rain_hist, temp_hist, rain_future, physics, cfg, hybrid.scale, hybrid.rain_scale
    )
    x = torch.tensor(hist[None], dtype=torch.float32).repeat(samples, 1, 1)
    f = torch.tensor(future[None], dtype=torch.float32).repeat(samples, 1)
    torch.manual_seed(cfg.seed + 1)
    if samples > 1:
        hybrid.model.train()
    else:
        hybrid.model.eval()
    with torch.no_grad():
        residual = hybrid.model(x, f).numpy() * hybrid.scale
    base = physics[None, :, None] if residual.ndim == 3 else physics[None, :]
    return base + residual


_PredictArgs = tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, ForecastConfig]


def _round(values: np.ndarray) -> list[float]:
    return [round(float(v), 2) for v in values]


def _band(mid: np.ndarray, sigma: float) -> dict[str, list[float]]:
    spread = Z90 * max(sigma, 0.1) * np.sqrt(np.arange(1, len(mid) + 1))
    return {"p10": _round(mid - spread), "p50": _round(mid), "p90": _round(mid + spread)}


def _hybrid_band(draws: np.ndarray, sigma: float) -> dict[str, list[float]]:
    """MC-dropout quantiles, never narrower than the physics residual band."""
    q10, q50, q90 = np.quantile(draws, (0.1, 0.5, 0.9), axis=0)
    spread = Z90 * sigma * np.sqrt(np.arange(1, draws.shape[1] + 1))
    return {
        "p10": _round(np.minimum(q10, q50 - spread)),
        "p50": _round(q50),
        "p90": _round(np.maximum(q90, q50 + spread)),
    }


def _quantile_band(hybrid: _Hybrid, args: _PredictArgs) -> dict[str, list[float]]:
    """Pinball-head quantiles, sorted so P10 <= P50 <= P90 (heads can cross)."""
    draws = np.sort(_hybrid_predict(hybrid, *args, samples=1)[0], axis=-1)
    return {"p10": _round(draws[:, 0]), "p50": _round(draws[:, 1]), "p90": _round(draws[:, 2])}


def inside_band(band: dict[str, list[float]], actual: np.ndarray) -> int:
    lo, hi = np.asarray(band["p10"]), np.asarray(band["p90"])
    return int(np.sum((actual >= lo) & (actual <= hi)))


def interval_score(band: dict[str, list[float]], actual: np.ndarray) -> float:
    """Gneiting and Raftery (2007) central-interval score for alpha = ALPHA; lower is better."""
    lo, hi = np.asarray(band["p10"]), np.asarray(band["p90"])
    misses = np.maximum(lo - actual, 0.0) + np.maximum(actual - hi, 0.0)
    return float(np.mean(hi - lo + (2 / ALPHA) * misses))


MIN_COVERAGE_N = 10
CONFORMAL_TARGET = (0.75, 0.85)


def conformal_quantile(residuals: list[float], alpha: float = ALPHA) -> float | None:
    """Split-conformal radius: the ceil((n + 1)(1 - alpha))-th smallest absolute residual."""
    k = math.ceil((len(residuals) + 1) * (1 - alpha))
    return sorted(residuals)[k - 1] if 0 < k <= len(residuals) else None


def conformal_check(
    points: dict[int, np.ndarray],
    actual: dict[int, np.ndarray],
    old_bands: dict[int, dict[str, list[float]]],
) -> dict[str, Any]:
    """B-TS-3 shadow: alternate paddies calibrate a per-lead radius, the others test it."""
    ids = sorted(points)
    cal, test = ids[0::2], ids[1::2]
    horizon = len(next(iter(points.values()))) if points else 0
    radius = [
        conformal_quantile([abs(float(actual[i][h] - points[i][h])) for i in cal])
        for h in range(horizon)
    ]
    if not test or any(r is None for r in radius):
        return {"status": "shadow", "pairs": 0, "reason": "too few paddies to calibrate a radius"}
    n = len(test) * horizon
    inside = sum(
        abs(float(actual[i][h] - points[i][h])) <= float(radius[h] or 0.0)
        for i in test
        for h in range(horizon)
    )
    old = sum(inside_band(old_bands[i], actual[i]) for i in test)
    cov, old_cov = inside / n, old / n
    lo, hi = CONFORMAL_TARGET
    return {
        "status": "promote"
        if n >= MIN_PROMOTION_PAIRS and lo <= cov <= hi and not lo <= old_cov <= hi
        else "shadow",
        "pairs": n,
        "coverage": round(cov, 3),
        "old_coverage": round(old_cov, 3),
        "radius_cm": [round(float(r or 0.0), 2) for r in radius],
        "rule": f"promote when coverage is {lo:.0%}-{hi:.0%} on {MIN_PROMOTION_PAIRS}+ test "
        "pairs while the old band falls outside",
    }


ROLLING_ORIGINS = 4


def rolling_origins(
    targets: list[np.ndarray], rain: np.ndarray, cfg: ForecastConfig, origins: int = ROLLING_ORIGINS
) -> dict[str, Any]:
    """Walk-forward cuts every `horizon` days back; each cut fits only on the days before it."""
    errors: dict[str, list[float]] = {PERSISTENCE: [], DAMPED_TREND: [], WATER_BALANCE: []}
    inside = dict.fromkeys(errors, 0)
    per_origin: list[dict[str, Any]] = []
    for j in range(origins):
        cut = len(rain) - cfg.horizon * (j + 1)
        if cut < cfg.window + cfg.horizon + 4:
            break
        end = cut + cfg.horizon
        train = [t[:cut] for t in targets]
        ok = [i for i, t in enumerate(targets) if not management_events(t, rain)[cut:end].any()]
        if not ok:
            per_origin.append({"cut": cut, "pairs": 0, "mae": {}})
            continue
        wb = _fit_water_balance(train, rain[:cut], cfg.recency_half_life_days)
        predictions = {
            PERSISTENCE: [np.full(cfg.horizon, train[i][-1]) for i in ok],
            DAMPED_TREND: [_damped(train[i], cfg.horizon) for i in ok],
            WATER_BALANCE: [wb.roll(i, train[i][-1], rain[cut:end]) for i in ok],
        }
        actual = [targets[i][cut:end] for i in ok]
        mae: dict[str, float] = {}
        for name, preds in predictions.items():
            diffs = [np.abs(p - a) for p, a in zip(preds, actual, strict=True)]
            errors[name].extend(float(d) for row in diffs for d in row)
            mae[name] = round(float(np.mean(diffs)), 3)
            inside[name] += sum(
                inside_band(_band(p, wb.sigma), a) for p, a in zip(preds, actual, strict=True)
            )
        per_origin.append({"cut": cut, "pairs": len(ok) * cfg.horizon, "mae": mae})
    pairs = len(errors[PERSISTENCE])
    return {
        "origins": len(per_origin),
        "pairs": pairs,
        "mae": {k: round(float(np.mean(v)), 3) for k, v in errors.items() if v},
        "coverage": {k: {"inside": inside[k], "n": pairs} for k in errors},
        "per_origin": per_origin,
        "rain": "observed at every origin: optimistic, the issued forecast covers the newest cut",
        "neural": "scored on the newest cut only; retraining per origin is too slow per request",
    }


def _backtest(
    targets: list[np.ndarray],
    rain: np.ndarray,
    temp: np.ndarray,
    cfg: ForecastConfig,
    issued: np.ndarray | None = None,
) -> tuple[dict[str, float], dict[str, Any], int, int]:
    cut = len(rain) - cfg.horizon
    train = [t[:cut] for t in targets]
    eligible = [i for i, t in enumerate(targets) if not management_events(t, rain)[cut:].any()]
    if not eligible:
        return {}, {}, 0, 0
    wb = _fit_water_balance(train, rain[:cut], cfg.recency_half_life_days)
    # the rain known at the cut; observed rain is the optimistic fallback
    future = issued if issued is not None else rain[cut:]
    predictors: dict[str, Callable[[int], np.ndarray]] = {
        PERSISTENCE: lambda i: np.full(cfg.horizon, train[i][-1]),
        DAMPED_TREND: lambda i: _damped(train[i], cfg.horizon),
        WATER_BALANCE: lambda i: wb.roll(i, train[i][-1], future),
    }

    def residual_band(
        predict: Callable[[int], np.ndarray],
    ) -> Callable[[int], dict[str, list[float]]]:
        return lambda i: _band(predict(i), wb.sigma)

    banders = {name: residual_band(predict) for name, predict in predictors.items()}
    windows = 0
    quantile_bander: Callable[[int], dict[str, list[float]]] | None = None
    if _TORCH_AVAILABLE:
        hybrid, windows = _train_hybrid(train, rain[:cut], temp[:cut], wb, cfg)
        heads = _train_hybrid(train, rain[:cut], temp[:cut], wb, cfg, quantile=True)[0]
        if hybrid is not None and heads is not None:

            def args(i: int) -> _PredictArgs:
                physics = wb.roll(i, train[i][-1], future)
                return (train[i], rain[:cut], temp[:cut], future, physics, cfg)

            def run(i: int, samples: int) -> np.ndarray:
                assert hybrid is not None
                return _hybrid_predict(hybrid, *args(i), samples=samples)

            predictors[HYBRID] = lambda i: run(i, 1)[0]
            banders[HYBRID] = lambda i: _hybrid_band(run(i, cfg.mc_samples), wb.sigma)
            quantile_bander = lambda i: _quantile_band(heads, args(i))  # noqa: E731
    actual = {i: targets[i][cut:] for i in eligible}
    scores = {
        name: float(np.mean([np.mean(np.abs(predict(i) - actual[i])) for i in eligible]))
        for name, predict in predictors.items()
    }
    bands = {name: {i: band(i) for i in eligible} for name, band in banders.items()}
    n = len(eligible) * cfg.horizon

    def summary(per: dict[int, dict[str, list[float]]]) -> tuple[int, float]:
        inside = sum(inside_band(per[i], actual[i]) for i in eligible)
        return inside, float(np.mean([interval_score(per[i], actual[i]) for i in eligible]))

    stats = {name: summary(per) for name, per in bands.items()}
    report: dict[str, Any] = {
        "band_coverage": {name: {"inside": s[0], "n": n} for name, s in stats.items()},
        "interval_score": {name: round(s[1], 3) for name, s in stats.items()},
        "quantile_heads": None,
        "conformal": conformal_check(
            {i: predictors[WATER_BALANCE](i) for i in eligible}, actual, bands[WATER_BALANCE]
        ),
    }
    if quantile_bander is not None:
        q_inside, q_score = summary({i: quantile_bander(i) for i in eligible})
        mc_inside, mc_score = stats[HYBRID]
        q_cov, mc_cov = q_inside / n, mc_inside / n
        report["quantile_heads"] = {
            "pairs": n,
            "interval_score": round(q_score, 3),
            "coverage": round(q_cov, 3),
            "mc_interval_score": round(mc_score, 3),
            "mc_coverage": round(mc_cov, 3),
            "promoted": n >= MIN_PROMOTION_PAIRS
            and q_score < mc_score
            and abs(q_cov - 0.8) < abs(mc_cov - 0.8),
            "rule": f"pinball heads replace MC dropout only with a lower interval score and "
            f"coverage closer to 80 % on at least {MIN_PROMOTION_PAIRS} held-out pairs",
        }
    return scores, report, len(eligible), windows


def forecast(
    series: Sequence[SeriesInput],
    rain_history: Sequence[float],
    temp_history: Sequence[float],
    rain_future: Sequence[float],
    config: ForecastConfig | None = None,
    rain_issued: Sequence[float] | None = None,
) -> dict[str, Any]:
    cfg = config or ForecastConfig()
    if not series:
        raise ValueError("at least one series is required")
    if not 1 <= cfg.horizon <= 21:
        raise ValueError("horizon must be between 1 and 21 days")
    rain = _finite(rain_history, "rain_history")
    temp = _finite(temp_history, "temp_history")
    future = _finite(rain_future, "rain_future")
    issued = _finite(rain_issued, "rain_issued") if rain_issued is not None else None
    if issued is not None and len(issued) != cfg.horizon:
        raise ValueError(f"rain_issued must have {cfg.horizon} values")
    if len(temp) != len(rain):
        raise ValueError("rain_history and temp_history must have equal length")
    if len(future) != cfg.horizon:
        raise ValueError(f"rain_future must have {cfg.horizon} values")
    targets = [_finite(s.target, f"series {s.id}") for s in series]
    if any(len(t) != len(rain) for t in targets):
        raise ValueError("every series must match the weather history length")

    started = time.perf_counter()
    min_length = cfg.window + 2 * cfg.horizon + 4
    if len(rain) < min_length:
        damped_bands: dict[str, dict[str, list[float]]] = {}
        for s, target in zip(series, targets, strict=True):
            sigma = float(np.std(np.diff(target))) if len(target) > 2 else 0.5
            damped_bands[s.id] = _band(_damped(target, cfg.horizon), sigma)
        return {
            "method": METHOD_FALLBACK,
            "fallback_reason": f"history shorter than {min_length} days",
            "horizon_days": cfg.horizon,
            "series": damped_bands,
            "backtest": None,
            "compute_ms": round((time.perf_counter() - started) * 1000, 1),
            "provenance": "modelled",
        }

    threads = torch.get_num_threads() if _TORCH_AVAILABLE else 0
    if _TORCH_AVAILABLE:
        torch.set_num_threads(1)
    try:
        scores, report, scored, windows = _backtest(targets, rain, temp, cfg, issued)
        report["backtest_rain"] = (
            "forecast issued at the cut"
            if issued is not None
            else "observed, optimistic: the backtest saw the rain that fell"
        )
        coverage: dict[str, dict[str, int]] = report.get("band_coverage") or {}
        held_out = min((c["n"] for c in coverage.values()), default=0)
        eligible = {
            k: v for k, v in scores.items() if k != HYBRID or held_out >= MIN_PROMOTION_PAIRS
        }
        chosen = min(eligible, key=lambda k: eligible[k]) if eligible else WATER_BALANCE
        wb = _fit_water_balance(targets, rain, cfg.recency_half_life_days)
        hybrid = _train_hybrid(targets, rain, temp, wb, cfg)[0] if chosen == HYBRID else None
        promoted = chosen == HYBRID and bool((report.get("quantile_heads") or {}).get("promoted"))
        heads = _train_hybrid(targets, rain, temp, wb, cfg, quantile=True)[0] if promoted else None
    finally:
        if _TORCH_AVAILABLE:
            torch.set_num_threads(threads)
    if chosen == HYBRID and hybrid is None:
        chosen = WATER_BALANCE
    per_series: dict[str, dict[str, list[float]]] = {}
    for i, (s, target) in enumerate(zip(series, targets, strict=True)):
        physics = wb.roll(i, target[-1], future)
        if chosen == HYBRID and heads is not None:
            per_series[s.id] = _quantile_band(heads, (target, rain, temp, future, physics, cfg))
        elif chosen == HYBRID and hybrid is not None:
            draws = _hybrid_predict(
                hybrid, target, rain, temp, future, physics, cfg, samples=cfg.mc_samples
            )
            per_series[s.id] = _hybrid_band(draws, wb.sigma)
        elif chosen == PERSISTENCE:
            per_series[s.id] = _band(np.full(cfg.horizon, target[-1]), wb.sigma)
        elif chosen == DAMPED_TREND:
            per_series[s.id] = _band(_damped(target, cfg.horizon), wb.sigma)
        else:
            per_series[s.id] = _band(physics, wb.sigma)

    backtest: dict[str, Any] | None = None
    if scores:
        scored_as = chosen if chosen in scores else WATER_BALANCE
        mae_model = scores[scored_as]
        mae_naive = scores[PERSISTENCE]
        backtest = {
            "band_coverage": report["band_coverage"],
            "coverage": report["band_coverage"][scored_as],
            "coverage_shown": report["band_coverage"][scored_as]["n"] >= MIN_COVERAGE_N,
            "interval_score": report["interval_score"],
            "quantile_heads": report["quantile_heads"],
            "conformal": report.get("conformal"),
            "backtest_rain": report["backtest_rain"],
            "rolling_origin": rolling_origins(targets, rain, cfg),
            "band_method": "pinball quantile heads"
            if heads is not None
            else "MC dropout"
            if chosen == HYBRID
            else "physics residual",
            "holdout_days": cfg.horizon,
            "series_scored": scored,
            "candidates": {name: round(v, 3) for name, v in sorted(scores.items())},
            "neural_candidate": (
                "scored"
                if HYBRID in scores
                else "torch unavailable"
                if not _TORCH_AVAILABLE
                else f"skipped: {windows} event-free training windows, "
                f"{cfg.min_neural_windows} required"
            ),
            "mae_model": round(mae_model, 3),
            "mae_persistence": round(mae_naive, 3),
            "skill_vs_persistence": round(1.0 - mae_model / mae_naive, 3)
            if mae_naive > 1e-9
            else 0.0,
            "note": "Model chosen by lowest hold-out MAE on series without irrigation or drainage "
            "events in the hold-out; forecasts are the no-intervention trajectory. backtest_rain "
            "says which rain the hold-out used. Not a field validation.",
        }
    return {
        "method": chosen,
        "fallback_reason": None if scores else "no event-free series to score; physics model used",
        "horizon_days": cfg.horizon,
        "series": per_series,
        "physics": {
            "rain_gain_cm_per_mm": round(wb.rain_gain, 4),
            "below_surface_adjustment_cm_day": round(wb.dry_gain, 3),
            "mean_daily_loss_cm": round(float(-np.mean(wb.intercepts)), 3),
            "residual_sigma_cm": round(wb.sigma, 3),
        },
        "backtest": backtest,
        "compute_ms": round((time.perf_counter() - started) * 1000, 1),
        "provenance": "modelled",
    }
