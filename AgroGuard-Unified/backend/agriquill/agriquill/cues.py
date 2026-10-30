from __future__ import annotations

import calendar
import uuid
from datetime import date, timedelta
from typing import Any

from . import market, producers, reach, season_match, supply
from .store import RecordCache

_STORE = RecordCache("contracts.sqlite")
CUE = "cue"
URL = "agriquill://cues"
PRIORITY = ("harvest-soon", "new-buyers", "processor-posted", "season-match", "glut-at-planting")
HARVEST_LEAD_DAYS = 21
REPEAT_DAYS = 7
PLANTED_MIN_DAYS, PLANTED_MAX_DAYS = 46, 150
DELIVERY_AHEAD_DAYS = 120
DIRECT_KM = 50.0


def _span(month: int, today: date) -> tuple[date, date]:
    year = today.year
    last = date(year, month, calendar.monthrange(year, month)[1])
    if last < today:
        year += 1
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def _grown(record: dict[str, Any]) -> set[str]:
    return {c["produce"] for c in record["crops"]}


def _recent(
    record: dict[str, Any], today: date, orders: list[dict[str, Any]], bulk_only: bool
) -> list[dict[str, Any]]:
    since = (today - timedelta(days=1)).isoformat()
    rows = []
    for p in orders:
        if p["status"] != "open" or p["produce"] not in _grown(record):
            continue
        if p["created_at"][:10] < since:
            continue
        if bulk_only and p.get("buyer_kind") not in reach.KINDS:
            continue
        km = market.km_between(record["lat"], record["lon"], p["lat"], p["lon"])
        if km <= (reach.REACH_KM if p.get("channel", "bulk") == "bulk" else DIRECT_KM):
            rows.append(p)
    return rows


def _harvest_soon(record: dict[str, Any], today: date) -> dict[str, Any] | None:
    for crop in record["crops"]:
        start, end = _span(crop["harvest_month"], today)
        days = max(0, (start - today).days)
        if today <= end and days <= HARVEST_LEAD_DAYS:
            return {"produce": crop["produce"], "days": days}
    return None


def _new_buyers(record: dict[str, Any], today: date) -> dict[str, Any] | None:
    rows = _recent(record, today, market.preorders(), False)
    return {"produce": rows[0]["produce"], "n": len(rows)} if rows else None


def _processor_posted(record: dict[str, Any], today: date) -> dict[str, Any] | None:
    rows = _recent(record, today, market.preorders(), True)
    rows += _recent(record, today, season_match._orders(), True)
    if not rows:
        return None
    town = record.get("township") or record.get("village") or ""
    level = market._balance(town, rows[0]["produce"], today)["level"] if town else "no-data"
    if level not in ("glut", "no-buyers"):
        return None
    return {"produce": rows[0]["produce"], "n": len(rows)}


def _season_match(actor: str, record: dict[str, Any], today: date) -> dict[str, Any] | None:
    ahead = {(today + timedelta(days=d)).month for d in range(0, DELIVERY_AHEAD_DAYS, 15)}
    strong = [
        row
        for row in season_match.matches(actor, record["id"], today)
        if row["fit"] == "strong" and ahead & set(row["delivery_months"])
    ]
    return {"n": len(strong)} if strong else None


def _glut_at_planting(record: dict[str, Any], today: date) -> dict[str, Any] | None:
    town = record.get("township") or record.get("village") or ""
    for crop in record["crops"]:
        start, _ = _span(crop["harvest_month"], today)
        on = start.replace(day=15)
        days = (on - today).days
        if not town or not PLANTED_MIN_DAYS <= days <= PLANTED_MAX_DAYS:
            continue
        if market.outlook(town, crop["produce"], on.isoformat(), today)["level"] == "glut":
            return {"produce": crop["produce"], "town": town}
    return None


def _candidate(kind: str, actor: str, record: dict[str, Any], today: date) -> dict[str, Any] | None:
    if kind == "harvest-soon":
        return _harvest_soon(record, today)
    if kind == "new-buyers":
        return _new_buyers(record, today)
    if kind == "processor-posted":
        return _processor_posted(record, today)
    if kind == "season-match":
        return _season_match(actor, record, today)
    return _glut_at_planting(record, today)


def _issued_recently(producer_id: str, today: date) -> set[str]:
    since = (today - timedelta(days=REPEAT_DAYS)).isoformat()
    return {
        r["cue"]["kind"]
        for r in _STORE.items(CUE)
        if r["producer_id"] == producer_id and r.get("cue") and r["cue"]["issued_on"] > since
    }


def cues(
    actor: str, producer_id: str, since: str | None = None, today: date | None = None
) -> list[dict[str, Any]]:
    record = producers.require_act(actor, producer_id)
    today = today or date.today()
    key = f"{producer_id}|{today.isoformat()}"
    hit = _STORE.get(CUE, key)
    if hit is None:
        skip = _issued_recently(producer_id, today)
        cue = None
        for kind in PRIORITY:
            params = None if kind in skip else _candidate(kind, actor, record, today)
            if params is not None:
                cue = {
                    "id": f"cue-{uuid.uuid4().hex[:12]}",
                    "kind": kind,
                    "params": params,
                    "issued_on": today.isoformat(),
                }
                break
        row = {"id": key, "producer_id": producer_id, "cue": cue}
        _STORE.update(CUE, key, lambda _old: row, URL)
    else:
        row = hit["payload"]
    cue = row["cue"]
    if cue is None or (since and cue["issued_on"] <= since):
        return []
    return [cue]


def buyer_cues(
    buyer: str, since: str | None = None, today: date | None = None
) -> list[dict[str, Any]]:
    today = today or date.today()
    key = f"buyer:{buyer}|{today.isoformat()}"
    hit = _STORE.get(CUE, key)
    if hit is None:
        cue = None
        for search in supply.searches(buyer):
            found = supply.supply(
                search["produce"],
                search["lat"],
                search["lon"],
                search["radius_km"],
                search["kg"],
                search["budget_mmk_kg"],
                today + timedelta(days=search["by_in_days"]),
                today,
            )
            fits = [
                r for g in found["groups"] for r in g["listings"] if r["band"] in (None, "within")
            ]
            if fits:
                cue = {
                    "id": f"cue-{uuid.uuid4().hex[:12]}",
                    "kind": "supply-match",
                    "params": {
                        "produce": search["produce"],
                        "n": len(fits),
                        "kg": sum(r["qty_kg"] for r in fits),
                    },
                    "issued_on": today.isoformat(),
                }
                break
        row = {"id": key, "producer_id": f"buyer:{buyer}", "cue": cue}
        if cue:
            _STORE.update(CUE, key, lambda _old: row, URL)
    else:
        row = hit["payload"]
    cue = row["cue"]
    if cue is None or (since and cue["issued_on"] <= since):
        return []
    return [cue]
