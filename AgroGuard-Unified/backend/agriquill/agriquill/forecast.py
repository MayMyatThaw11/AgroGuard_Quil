from __future__ import annotations

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
        def __init__(self, hidden: int, horizon: int, dropout: float) -> None:
            super().__init__()
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
                nn.Linear(48, horizon),
            )

        def forward(self, history: torch.Tensor, future: torch.Tensor) -> torch.Tensor:
            features = self.encoder(history.transpose(1, 2))[:, :, history.shape[1] - 1]
            return self.head(torch.cat([features, future], dim=1))


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
    model = _ResidualNet(cfg.hidden, cfg.horizon, cfg.dropout)
    optimiser = torch.optim.AdamW(
        model.parameters(), lr=cfg.learning_rate, weight_decay=cfg.weight_decay
    )
    xt = torch.tensor(np.asarray(xs), dtype=torch.float32)
    ft = torch.tensor(np.asarray(fs), dtype=torch.float32)
    yt = torch.tensor(np.asarray(ys), dtype=torch.float32)
    loss_fn = nn.SmoothL1Loss()
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
    return physics[None, :] + residual


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


def inside_band(band: dict[str, list[float]], actual: np.ndarray) -> int:
    lo, hi = np.asarray(band["p10"]), np.asarray(band["p90"])
    return int(np.sum((actual >= lo) & (actual <= hi)))


MIN_COVERAGE_N = 10


def _backtest(
    targets: list[np.ndarray],
    rain: np.ndarray,
    temp: np.ndarray,
    cfg: ForecastConfig,
) -> tuple[dict[str, float], dict[str, dict[str, int]], int, int]:
    cut = len(rain) - cfg.horizon
    train = [t[:cut] for t in targets]
    eligible = [i for i, t in enumerate(targets) if not management_events(t, rain)[cut:].any()]
    if not eligible:
        return {}, {}, 0, 0
    wb = _fit_water_balance(train, rain[:cut], cfg.recency_half_life_days)
    future = rain[cut:]
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
    if _TORCH_AVAILABLE:
        hybrid, windows = _train_hybrid(train, rain[:cut], temp[:cut], wb, cfg)
        if hybrid is not None:

            def run(i: int, samples: int) -> np.ndarray:
                physics = wb.roll(i, train[i][-1], future)
                assert hybrid is not None
                return _hybrid_predict(
                    hybrid, train[i], rain[:cut], temp[:cut], future, physics, cfg, samples
                )

            predictors[HYBRID] = lambda i: run(i, 1)[0]
            banders[HYBRID] = lambda i: _hybrid_band(run(i, cfg.mc_samples), wb.sigma)
    scores = {
        name: float(np.mean([np.mean(np.abs(predict(i) - targets[i][cut:])) for i in eligible]))
        for name, predict in predictors.items()
    }
    coverage = {
        name: {
            "inside": sum(inside_band(band(i), targets[i][cut:]) for i in eligible),
            "n": len(eligible) * cfg.horizon,
        }
        for name, band in banders.items()
    }
    return scores, coverage, len(eligible), windows


def forecast(
    series: Sequence[SeriesInput],
    rain_history: Sequence[float],
    temp_history: Sequence[float],
    rain_future: Sequence[float],
    config: ForecastConfig | None = None,
) -> dict[str, Any]:
    cfg = config or ForecastConfig()
    if not series:
        raise ValueError("at least one series is required")
    if not 1 <= cfg.horizon <= 21:
        raise ValueError("horizon must be between 1 and 21 days")
    rain = _finite(rain_history, "rain_history")
    temp = _finite(temp_history, "temp_history")
    future = _finite(rain_future, "rain_future")
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
        scores, coverage, scored, windows = _backtest(targets, rain, temp, cfg)
        chosen = min(scores, key=lambda k: scores[k]) if scores else WATER_BALANCE
        wb = _fit_water_balance(targets, rain, cfg.recency_half_life_days)
        hybrid = _train_hybrid(targets, rain, temp, wb, cfg)[0] if chosen == HYBRID else None
    finally:
        if _TORCH_AVAILABLE:
            torch.set_num_threads(threads)
    if chosen == HYBRID and hybrid is None:
        chosen = WATER_BALANCE
    per_series: dict[str, dict[str, list[float]]] = {}
    for i, (s, target) in enumerate(zip(series, targets, strict=True)):
        physics = wb.roll(i, target[-1], future)
        if chosen == HYBRID and hybrid is not None:
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
            "band_coverage": coverage,
            "coverage": coverage[scored_as],
            "coverage_shown": coverage[scored_as]["n"] >= MIN_COVERAGE_N,
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
            "events in the hold-out; forecasts are the no-intervention trajectory. Observed rain "
            "stands in for the rain forecast. Not a field validation.",
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
