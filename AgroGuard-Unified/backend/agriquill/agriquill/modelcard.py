from __future__ import annotations

import csv
import io
from datetime import UTC, date, datetime, timedelta
from typing import Any

from . import contract, cropvalue, forecast, live, ml, onboard, telemetry
from .data import weather
from .store import now_iso

HISTORY_DAYS = 60
STATUSES = ("in use", "promoted", "rule met, still in shadow", "shadow", "not run")
COLUMNS = (
    "model",
    "predicts",
    "baseline",
    "metric",
    "value",
    "baseline_value",
    "pairs",
    "status",
    "reason",
    "rule",
    "source",
)
FORECAST_SOURCE = "agriquill/forecast.py forecast().backtest on the contract's tube readings"
NOTE = (
    "Every value is copied from a backtest or check the code already runs; the card computes "
    "no accuracy figure of its own. A null value carries its reason."
)


def _row(
    model: str, predicts: str, baseline: str, metric: str, source: str, **fields: Any
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "model": model,
        "predicts": predicts,
        "baseline": baseline,
        "metric": metric,
        "value": None,
        "baseline_value": None,
        "pairs": None,
        "status": "not run",
        "reason": None,
        "rule": None,
        "source": source,
    }
    out.update(fields)
    return out


def _shadow(code_status: str) -> str:
    return "rule met, still in shadow" if code_status == "promote" else "shadow"


def _depth_backtest(spec: dict[str, Any], client: Any) -> tuple[dict[str, Any] | None, str | None]:
    cfg = forecast.ForecastConfig()
    need = cfg.window + 2 * cfg.horizon + 4
    lat, lon = spec["farm"]["location"]
    wx = weather.fetch_hourly(lat, lon, HISTORY_DAYS, cfg.horizon + 1, client)
    if wx.get("hourly") is None:
        return None, wx["missing"][0]["reason"]
    offset = int(wx.get("utc_offset_seconds") or 0)
    today = (datetime.now(UTC) + timedelta(seconds=offset)).date().isoformat()
    days = weather.daily_from_hourly(wx["hourly"])
    past = [d for d in days if d["date"] < today and d["hours"] == 24]
    future = [d for d in days if d["date"] >= today][: cfg.horizon]
    if len(future) < cfg.horizon:
        return None, f"the weather forecast has fewer than {cfg.horizon} days"
    # shortcut: tube days are UTC dates and weather days are local; key both by local date
    # once a farm sits far enough from UTC for a reading to land on the wrong day
    start = datetime.now(UTC).date() - timedelta(days=HISTORY_DAYS + 1)
    runs: dict[str, list[float]] = {}
    longest = 0
    for p in spec["parcels"]:
        device = contract.terms_for(spec, p["id"]).get("sensors", {}).get("water_depth")
        if not device:
            continue
        means = telemetry.daily_means(device, "water_depth_cm", HISTORY_DAYS + 1)
        by_day = {(start + timedelta(days=i + 1)).isoformat(): v for i, v in enumerate(means)}
        run: list[float] = []
        for d in reversed(past):
            value = by_day.get(d["date"])
            if value is None:
                break
            run.insert(0, value)
        longest = max(longest, len(run))
        if len(run) >= need:
            runs[p["id"]] = run
    if not runs:
        return None, (
            f"needs {need} days in a row with a tube reading on at least one paddy; "
            f"the longest run is {longest}"
        )
    n = min(len(r) for r in runs.values())
    history = past[-n:]
    cut = date.fromisoformat(history[-1]["date"]) - timedelta(days=cfg.horizon)
    issued = weather.issued_rain(lat, lon, cut, cfg.horizon, client)
    result = forecast.forecast(
        [forecast.SeriesInput(pid, r[-n:]) for pid, r in runs.items()],
        [d["rain_mm"] for d in history],
        [d["temp_c"] for d in history],
        [d["rain_mm"] for d in future],
        cfg,
        issued["rain_mm"],
    )
    if result["backtest"] is None:
        return None, result["fallback_reason"]
    issued_status = (
        {"source": issued["source"], "cut": issued["cut"]}
        if issued["rain_mm"] is not None
        else {"missing": issued["missing"]}
    )
    return {
        "backtest": result["backtest"],
        "method": result["method"],
        "issued_rain": issued_status,
        "paddies": sorted(runs),
        "weather": wx["source"],
    }, None


def _forecast_rows(found: dict[str, Any] | None, reason: str | None) -> list[dict[str, Any]]:
    depth = "paddy water depth over the next 10 days"
    names = (
        ("depth-forecast", "persistence", "hold-out MAE cm, newest cut"),
        ("depth-forecast-rolling", "persistence", "rolling-origin MAE cm, water balance"),
        ("B-TS-2 quantile heads", "MC dropout band", "interval score, alpha 0.2"),
        ("B-TS-3 split conformal", "physics residual band", "coverage of the P10-P90 band"),
    )
    head = [(m, depth, b, metric, FORECAST_SOURCE) for m, b, metric in names]
    if found is None:
        return [_row(*h, reason=reason) for h in head]
    bt = found["backtest"]
    context = {
        "rain_basis": bt["backtest_rain"],
        "issued_rain": found["issued_rain"],
        "paddies": found["paddies"],
        "weather": found["weather"],
    }
    rolling = bt["rolling_origin"]
    wb = forecast.WATER_BALANCE
    heads = bt["quantile_heads"]
    conformal = bt["conformal"] or {}
    rows = [
        _row(
            *head[0],
            value=bt["mae_model"],
            baseline_value=bt["mae_persistence"],
            pairs=bt["series_scored"] * bt["holdout_days"],
            status="in use",
            chosen=found["method"],
            coverage=bt["coverage"],
            interval_score=bt["interval_score"],
            **context,
        ),
        _row(
            *head[1],
            value=rolling["mae"].get(wb),
            baseline_value=rolling["mae"].get(forecast.PERSISTENCE),
            pairs=rolling["pairs"],
            status="in use",
            reason=None if rolling["mae"] else "no event-free cut to score",
            coverage=rolling["coverage"].get(wb),
            rain_basis=rolling["rain"],
            origins=rolling["origins"],
        ),
    ]
    if heads is None:
        rows.append(_row(*head[2], reason=f"neural candidate {bt['neural_candidate']}"))
    else:
        rows.append(
            _row(
                *head[2],
                value=heads["interval_score"],
                baseline_value=heads["mc_interval_score"],
                pairs=heads["pairs"],
                status="promoted"
                if heads["promoted"] and found["method"] == forecast.HYBRID
                else _shadow("promote" if heads["promoted"] else "shadow"),
                rule=heads["rule"],
                coverage=heads["coverage"],
                baseline_coverage=heads["mc_coverage"],
                **context,
            )
        )
    rows.append(
        _row(
            *head[3],
            value=conformal.get("coverage"),
            baseline_value=conformal.get("old_coverage"),
            pairs=conformal.get("pairs"),
            status=_shadow(conformal.get("status", "shadow")),
            reason=conformal.get("reason"),
            rule=conformal.get("rule"),
            **context,
        )
    )
    return rows


def _filter_rows(paddies: list[dict[str, Any]], reason: str | None) -> list[dict[str, Any]]:
    source = "agriquill/fusion.py next_reading_backtest via the live plan"
    if not paddies:
        return [
            _row(
                "B-TS-5 augmented filter",
                "next tube reading",
                "one-state Kalman filter",
                "next-reading MAE cm",
                source,
                reason=reason,
            ),
            _row(
                "B-TS-6 changepoints",
                "irrigation and drainage events",
                "2 cm jump rule",
                "recall against farmer-confirmed events",
                source,
                reason=reason,
            ),
        ]
    rows = []
    for p in paddies:
        shadow = p.get("shadow")
        why = None if shadow else next((m["reason"] for m in p["missing"]), "no shadow run")
        mae = (shadow or {}).get("mae_cm") or {}
        points = (shadow or {}).get("changepoints") or {}
        rows.append(
            _row(
                "B-TS-5 augmented filter",
                f"next tube reading, {p['id']}",
                "one-state Kalman filter",
                "next-reading MAE cm",
                source,
                value=mae.get("augmented"),
                baseline_value=mae.get("one_state"),
                pairs=(shadow or {}).get("pairs"),
                status=_shadow(shadow["status"]) if shadow else "not run",
                reason=why or (shadow or {}).get("reason"),
                rule=(shadow or {}).get("rule"),
                priors=(shadow or {}).get("priors"),
            )
        )
        rows.append(
            _row(
                "B-TS-6 changepoints",
                f"irrigation and drainage events, {p['id']}",
                "2 cm jump rule",
                "recall against farmer-confirmed events",
                source,
                pairs=(shadow or {}).get("pairs"),
                status="shadow" if shadow else "not run",
                reason=why or points.get("recall_reason"),
                rule="BUILD_PLAN_BACKEND.md B-TS-6: higher recall than the 2 cm rule at no "
                "more than 1 false event per paddy per month",
            )
        )
    return rows


def _next_reading_row(farm_id: str, client: Any) -> dict[str, Any]:
    found = onboard.backtest(farm_id, client)
    overall = found.get("overall")
    reason = None
    if found["status"] != "OK":
        reason = found["missing"][0]["reason"]
    elif overall is None:
        reason = "every reading pair had an inflow; nothing to score"
    return _row(
        "water-balance next reading",
        "next tube reading from rain, ET0 x Kc and percolation",
        "no change: the next reading equals the last one",
        "next-reading MAE cm",
        "agriquill/onboard.py backtest on the archive weather",
        value=(overall or {}).get("model_mae_cm"),
        baseline_value=(overall or {}).get("no_change_mae_cm"),
        pairs=(overall or {}).get("pairs"),
        status="in use" if overall else "not run",
        reason=reason,
        period=found.get("period"),
    )


def _decision_row(farm_id: str) -> dict[str, Any]:
    found = live.decisions(live.proposals(farm_id))
    scored = found["scored"]
    return _row(
        "rehearsed decisions",
        "depth after an approved job, the act branch P10-P90",
        "the band's nominal P10-P90 coverage",
        "measured outcomes inside the band",
        "agriquill/live.py decisions over scored proposals",
        value=found["inside_band"] if scored else None,
        pairs=scored,
        status="in use" if scored else "not run",
        reason=None if scored else "no approved job has a scored outcome yet",
        mean_abs_error_cm=found["mean_abs_error_cm"],
        model_status=found["status"],
    )


def _yield_rows(spec: dict[str, Any]) -> list[dict[str, Any]]:
    ref = cropvalue.harvest_reference(spec)
    rows: dict[str, dict[str, Any]] = {}
    for p in ref["parcels"]:
        found = p.get("yield") or {}
        check = found.get("backtest")
        key = found.get("item") or p.get("reason") or "unknown"
        if key in rows:
            continue
        reason = p.get("reason")
        if reason is None and check is None:
            reason = "fewer than 15 years of FAOSTAT yield to check"
        rows[key] = _row(
            "national yield persistence",
            f"{ref['country_name'] or 'national'} {found.get('item') or p.get('crop')} yield "
            "next year",
            "itself: last year's national yield",
            "years within 10 %",
            "agriquill/yieldcast.py persistence_check via cropvalue.harvest_reference",
            value=(check or {}).get("within_10"),
            pairs=(check or {}).get("n"),
            status="in use" if check else "not run",
            reason=reason,
            rule=(check or {}).get("rule"),
            mape_pct=(check or {}).get("mape_pct"),
            years=(check or {}).get("years"),
            data=found.get("source"),
        )
    return list(rows.values())


def _crop_row() -> dict[str, Any]:
    return _row(
        "B-ML-1 crop classifier",
        "best crop from soil pH, rainfall and temperature",
        "none named until field labels exist",
        "held-out accuracy by township",
        "agriquill/ml.py VALIDATION",
        value=ml.VALIDATION["held_out_accuracy"],
        reason=ml.VALIDATION["reason"],
        validated_on_field_data=ml.VALIDATION["validated_on_field_data"],
    )


def build(farm_id: str, client: Any = None) -> dict[str, Any]:
    loaded = live.load(farm_id)
    if loaded is None or loaded[1]["contract"] is None:
        raise KeyError(farm_id)
    spec = loaded[1]["contract"]
    if not spec["farm"].get("location") or len(spec["farm"]["location"]) != 2:
        raise ValueError("contract farm block needs location: [lat, lon]")
    current = live.build_live(farm_id, client)
    paddies = current.get("paddies") or []
    plan_reason = None if paddies else next((m["reason"] for m in current["missing"]), None)
    found, reason = _depth_backtest(spec, client)
    return {
        "farm_id": farm_id,
        "generated_at": now_iso(),
        "statuses": list(STATUSES),
        "rows": [
            *_forecast_rows(found, reason),
            *_filter_rows(paddies, plan_reason or "the live plan has no paddy"),
            _next_reading_row(farm_id, client),
            _decision_row(farm_id),
            *_yield_rows(spec),
            _crop_row(),
        ],
        "note": NOTE,
    }


def to_csv(card: dict[str, Any]) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(COLUMNS)
    for row in card["rows"]:
        writer.writerow("" if row[c] is None else row[c] for c in COLUMNS)
    return out.getvalue()
