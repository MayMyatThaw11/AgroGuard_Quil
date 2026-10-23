from __future__ import annotations

import importlib.util
import json
from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import date, timedelta
from typing import Any

from . import live, season
from .season_inputs import site_inputs
from .store import RecordCache, sha256

Engine = Callable[[Mapping[str, Any], Mapping[str, Any]], dict[str, Any]]
ENGINES: dict[str, Engine] = {"own": season.run}
if importlib.util.find_spec("aquacrop") is not None:
    from . import season_aquacrop

    ENGINES["aquacrop"] = season_aquacrop.run
if importlib.util.find_spec("pcse") is not None:
    from . import season_wofost

    ENGINES["wofost"] = season_wofost.run
# shortcut: fixed timeout per engine, tune after the first measured timings
ENGINE_TIMEOUT_S = 60
CACHE_TTL_S = 7 * 86400
CACHE_VERSION = "season-run-1"
COMPARISON = "comparison only, no measured yields to score against"
_STORE = RecordCache("contracts.sqlite")


def _shift(plan: Mapping[str, Any], year: int) -> dict[str, Any]:
    old = date.fromisoformat(plan["transplant_date"])
    try:
        new = old.replace(year=year)
    except ValueError:
        new = old.replace(year=year, day=28)
    delta = new - old

    def move(text: str) -> str:
        return (date.fromisoformat(text) + delta).isoformat()

    return {
        **plan,
        "transplant_date": new.isoformat(),
        "events": [{**e, "date": move(e["date"])} for e in plan.get("events", [])],
    }


def _failed(exc: BaseException) -> dict[str, Any]:
    if isinstance(exc, FutureTimeout):
        return {"status": "failed", "reason": f"timed out after {ENGINE_TIMEOUT_S} s"}
    return {"status": "failed", "reason": f"{type(exc).__name__}: {exc}"}


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def compare(results: Mapping[str, dict[str, Any]]) -> dict[str, Any]:
    ran = {name: r for name, r in results.items() if r.get("days")}
    by_date: dict[str, dict[str, dict[str, Any]]] = {}
    for name, result in ran.items():
        for row in result["days"]:
            day = by_date.setdefault(row["date"], {})
            for var, cell in row["vars"].items():
                day.setdefault(var, {})[name] = cell.get("value")
    days = []
    for when in sorted(by_date):
        cells = {}
        for var, engines in by_date[when].items():
            numbers = [n for n in (_number(v) for v in engines.values()) if n is not None]
            cells[var] = {
                "min": min(numbers) if numbers else None,
                "max": max(numbers) if numbers else None,
                "engines": engines,
            }
        days.append({"date": when, "vars": cells})
    yields = {
        name: _number(((r.get("summary") or {}).get("yield_kg_ha") or {}).get("value"))
        for name, r in ran.items()
    }
    known = [y for y in yields.values() if y is not None]
    return {
        "days": days,
        "summary": {
            "yield_kg_ha": {
                "min": min(known) if known else None,
                "max": max(known) if known else None,
                "by_engine": yields,
                "unit": "kg DM/ha",
            }
        },
    }


def _run_engines(plan: Mapping[str, Any], inputs: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=max(1, len(ENGINES))) as pool:
        futures = {name: pool.submit(fn, plan, inputs) for name, fn in ENGINES.items()}
        for name, future in futures.items():
            try:
                out[name] = future.result(timeout=ENGINE_TIMEOUT_S)
            except Exception as exc:
                out[name] = _failed(exc)
    return out


def _spread(years: list[dict[str, Any]]) -> dict[str, Any]:
    if len(years) < 2:
        return {}
    out: dict[str, Any] = {}
    for name in ENGINES:
        values = {}
        for y in years:
            value = y["compare"]["summary"]["yield_kg_ha"]["by_engine"].get(name)
            if value is not None:
                values[str(y["year"])] = value
        if len(values) >= 2:
            out[name] = {
                "yield_kg_ha": {
                    "min": min(values.values()),
                    "max": max(values.values()),
                    "years": values,
                    "unit": "kg DM/ha",
                    "means": "weather alone moves this engine's yield between min and max",
                }
            }
    return out


def run(farm_id: str, parcel_id: str, plan: dict[str, Any]) -> dict[str, Any]:
    loaded = live.load(farm_id)
    spec = loaded[1]["contract"] if loaded else None
    if spec is None or loaded is None:
        raise KeyError(farm_id)
    if parcel_id not in {p["id"] for p in spec["parcels"]}:
        raise KeyError(parcel_id)
    canon = json.dumps(
        {
            "plan": plan,
            "engines": sorted(ENGINES),
            "contract": sha256(loaded[0].encode("utf-8")),
            "version": CACHE_VERSION,
        },
        sort_keys=True,
        default=str,
    )
    key = sha256(canon.encode("utf-8"))
    cache_key = f"{farm_id}|{parcel_id}|{key}"
    cached = _STORE.get("season_run", cache_key)
    if cached and not cached["stale"]:
        return {**cached["payload"], "cached": True}
    years = []
    for year in plan["weather_years"]:
        shifted = _shift(plan, int(year))
        nursery = int(shifted.get("seedbed_days") or 0)
        start = date.fromisoformat(shifted["transplant_date"]) - timedelta(days=nursery)
        inputs = site_inputs(farm_id, parcel_id, start, nursery + int(shifted["duration_days"]))
        engines = _run_engines(shifted, inputs)
        years.append(
            {
                "year": int(year),
                "lat": inputs.get("lat"),
                "lon": inputs.get("lon"),
                "location_basis": inputs.get("location_basis"),
                "inputs_source": {
                    "weather": (inputs.get("weather") or {}).get("source"),
                    "soil": (inputs.get("soil") or {}).get("provider"),
                    "hydraulics": (inputs.get("hydraulics") or {}).get("source"),
                },
                "missing": inputs.get("missing", []),
                "plan": shifted,
                "engines": engines,
                "compare": compare(engines),
            }
        )
    out = {
        "farm_id": farm_id,
        "parcel_id": parcel_id,
        "plan_sha256": key,
        "years": years,
        "spread": _spread(years),
        "status": season.STATUS,
        "comparison": COMPARISON,
        "cached": False,
    }
    _STORE.put("season_run", cache_key, out, f"agriquill:season-run/{farm_id}", key, CACHE_TTL_S)
    return out
