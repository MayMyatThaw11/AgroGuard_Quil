from __future__ import annotations

from datetime import date
from typing import Any

from . import cropvalue, harvests, live, season_run
from .store import RecordCache, now_iso

_STORE = RecordCache("contracts.sqlite")
SOURCE = "harvest_score"
# Our rule, not a standard: fewer scored seasons than this are shown but not called a score.
MIN_PAIRS = 3
# shortcut: the newest seasons only, to bound the request time; raise it with a job queue
MAX_SEASONS = 12
ENGINE_BASIS = (
    "engine grain dry matter (kg DM/ha) for the recorded plan on the real weather of that "
    "season, against the measured dry grain (kg/ha) from the weighed harvest; error % = "
    "(engine - measured) / measured x 100; the engines are uncalibrated and are not tuned on "
    "these seasons"
)
BASELINE_BASIS = (
    "FAOSTAT national yield, latest year, against the measured kg/ha at 14 % moisture; FAOSTAT "
    "does not state the moisture basis of paddy, TO VERIFY"
)
NOTE = (
    "A harvest is scored only with a recorded plan, a moisture reading and a harvest date on or "
    "after the plan's transplant date. Nothing here changes an engine."
)


def _skip(h: dict[str, Any]) -> str | None:
    plan = h.get("plan")
    if not plan:
        return "no season plan was recorded with this harvest"
    if (h.get("yield") or {}).get("dry_kg_ha") is None:
        return (h.get("yield") or {}).get("reason") or "no measured dry yield"
    if date.fromisoformat(str(h["harvested_on"])) < date.fromisoformat(plan["transplant_date"]):
        return "the harvest date is before the transplant date in the plan"
    return None


def _error(value: float, measured: float) -> float:
    return round((value - measured) / measured * 100, 2)


def _summary(seasons: list[dict[str, Any]], basis: str) -> dict[str, Any]:
    n = len(seasons)
    errors = [s["error_pct"] for s in seasons]
    return {
        "pairs": n,
        "mean_abs_pct_error": round(sum(abs(e) for e in errors) / n, 2) if n else None,
        "mean_signed_pct_error": round(sum(errors) / n, 2) if n else None,
        "seasons": seasons,
        "status": f"too few seasons ({n} of {MIN_PAIRS})"
        if 0 < n < MIN_PAIRS
        else ("scored" if n else "no scored seasons"),
        "basis": basis,
    }


def _national(spec: dict[str, Any], parcel: str) -> float | None:
    for p in cropvalue.harvest_reference(spec)["parcels"]:
        if p["parcel"] == parcel:
            t_ha = (p.get("yield") or {}).get("t_ha")
            return float(t_ha) * 1000 if t_ha is not None else None
    return None


def score(farm_id: str) -> dict[str, Any]:
    loaded = live.load(farm_id)
    spec = loaded[1]["contract"] if loaded else None
    if spec is None:
        raise KeyError(farm_id)
    rows = harvests.farm_harvests(farm_id)
    skipped: list[dict[str, Any]] = []
    scorable = []
    for h in rows:
        why = _skip(h)
        if why:
            skipped.append({"id": h["id"], "harvested_on": h["harvested_on"], "reason": why})
        else:
            scorable.append(h)
    older = scorable[MAX_SEASONS:]
    skipped += [
        {"id": h["id"], "harvested_on": h["harvested_on"], "reason": "older than the newest 12"}
        for h in older
    ]
    pairs: dict[str, list[dict[str, Any]]] = {name: [] for name in season_run.ENGINES}
    reasons: dict[str, str] = {}
    baseline: list[dict[str, Any]] = []
    for h in scorable[:MAX_SEASONS]:
        plan = {
            **h["plan"],
            "weather_years": [date.fromisoformat(h["plan"]["transplant_date"]).year],
        }
        try:
            year = season_run.run(farm_id, h["parcel"], plan)["years"][0]
        except (KeyError, ValueError) as exc:
            skipped.append({"id": h["id"], "harvested_on": h["harvested_on"], "reason": str(exc)})
            continue
        measured = h["yield"]["dry_kg_ha"]
        by_engine = year["compare"]["summary"]["yield_kg_ha"]["by_engine"]
        for name in season_run.ENGINES:
            value = by_engine.get(name)
            if value is None:
                failed = (year["engines"].get(name) or {}).get("reason")
                reasons[name] = failed or "the engine returned no yield"
                continue
            pairs[name].append(
                {
                    "id": h["id"],
                    "harvested_on": h["harvested_on"],
                    "measured_dry_kg_ha": measured,
                    "engine_kg_dm_ha": round(value, 1),
                    "error_pct": _error(value, measured),
                }
            )
        national = _national(spec, h["parcel"])
        at_14 = h["yield"]["kg_ha_14"]
        if national is not None and at_14:
            baseline.append(
                {
                    "id": h["id"],
                    "harvested_on": h["harvested_on"],
                    "measured_kg_ha_14": at_14,
                    "national_kg_ha": round(national, 1),
                    "error_pct": _error(national, at_14),
                }
            )
    engines = {}
    for name, seasons in pairs.items():
        summary = _summary(seasons, ENGINE_BASIS)
        engines[name] = {
            **summary,
            "reason": reasons.get(name) if len(seasons) < len(scorable) else None,
        }
    out = {
        "farm_id": farm_id,
        "scored_at": now_iso(),
        "min_pairs": MIN_PAIRS,
        "min_pairs_basis": "our rule: fewer scored seasons are shown but not called a score",
        "engines": engines,
        "baseline": _summary(baseline, BASELINE_BASIS),
        "skipped": skipped,
        "status": "uncalibrated",
        "note": NOTE,
    }
    _STORE.put(
        SOURCE, farm_id, out, f"agriquill:harvest-score/{farm_id}", str(out["scored_at"]), None
    )
    return out


def saved(farm_id: str) -> dict[str, Any] | None:
    found = _STORE.get(SOURCE, farm_id)
    return found["payload"] if found else None
