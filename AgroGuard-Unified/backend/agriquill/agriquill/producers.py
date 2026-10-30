from __future__ import annotations

import hashlib
import hmac
import secrets
import time
import uuid
from typing import Any

from . import entitlements
from .config import SMALL_MEDIUM_MAX_HA, get_settings
from .ledger import get_ledger
from .store import RecordCache, now_iso

_STORE = RecordCache("contracts.sqlite")
PRODUCER = "producer"
URL = "agriquill://producers"
KINDS = frozenset({"individual", "household", "group"})
WANTS = ("cash-at-harvest", "pickup-needed", "inputs-needed", "flexible-date")
CAN_OFFER = ("weekly-delivery", "grade-sorting", "group-volume")
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
CODE_LENGTH = 6
SAME_PLACE_M = 50.0
MAX_FARM_HA = SMALL_MEDIUM_MAX_HA
CLAIM_TRIES_PER_HOUR = 5
PBKDF2_ROUNDS = 120_000
PUBLIC_DECIMALS = 2


class NearbyProfile(Exception):
    def __init__(self, profile: dict[str, Any]) -> None:
        super().__init__(f"{profile['name']} is already registered here")
        self.profile = profile


class PlanLimit(Exception):
    pass


def _hash(secret: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", secret.encode(), salt.encode(), PBKDF2_ROUNDS).hex()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _log(kind: str, payload: dict[str, Any]) -> None:
    get_ledger(get_settings().ledger_path).append(kind, payload)


def _metres(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from .market import km_between

    return km_between(lat1, lon1, lat2, lon2) * 1000.0


def _crops(raw: Any) -> list[dict[str, Any]]:
    from .market import PRODUCE

    crops = []
    for crop in raw or []:
        produce = str(crop.get("produce") or "").strip().lower()
        if produce not in PRODUCE:
            raise ValueError(f"produce must be one of {', '.join(sorted(PRODUCE))}")
        month = int(crop.get("harvest_month") or 0)
        if not 1 <= month <= 12:
            raise ValueError("harvest_month must be 1 to 12")
        crops.append(
            {"produce": produce, "harvest_month": month, "area_ha": _area(crop.get("area_ha"))}
        )
    if not crops:
        raise ValueError("add at least one crop with its harvest month")
    return crops


def _area(raw: Any) -> float | None:
    if raw in (None, ""):
        return None
    area = float(raw)
    if not 0 < area <= MAX_FARM_HA:
        raise ValueError(f"area_ha must be above 0 and up to {MAX_FARM_HA:.0f} ha")
    return area


def _flags(raw: Any, allowed: tuple[str, ...], field: str) -> list[str]:
    picked = [str(x) for x in raw or []]
    if any(x not in allowed for x in picked):
        raise ValueError(f"{field} must be from: {', '.join(allowed)}")
    return [x for x in allowed if x in picked]


def _members(raw: Any) -> list[dict[str, Any]]:
    members = []
    for member in raw or []:
        name = str(member.get("name") or "").strip()
        if not name or len(name) > 80:
            raise ValueError("each member needs a name (up to 80 characters)")
        members.append({"name": name, "area_ha": _area(member.get("area_ha"))})
    return members


def total_area(record: dict[str, Any]) -> float:
    crop_area = sum(c["area_ha"] or 0.0 for c in record["crops"])
    member_area = sum(m["area_ha"] or 0.0 for m in record["members"])
    return max(crop_area, member_area)


def public_view(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record["id"],
        "name": record["name"],
        "kind": record["kind"],
        "members": len(record["members"]),
        "crops": [
            {"produce": c["produce"], "harvest_month": c["harvest_month"]} for c in record["crops"]
        ],
        "public_lat": record["public_lat"],
        "public_lon": record["public_lon"],
        "township": record["township"],
    }


def all_profiles() -> list[dict[str, Any]]:
    return _STORE.items(PRODUCER)


def managed_area(account: str) -> float:
    return sum(
        total_area(r)
        for r in all_profiles()
        if r["manager"] == account and not r["manager_revoked"]
    )


def plan_usage(account: str) -> dict[str, Any]:
    return {"ha_used": round(managed_area(account), 2), "ha_limit": entitlements.ha_limit(account)}


def _check_plan(manager: str | None, added_ha: float) -> None:
    if manager is None or added_ha <= 0:
        return
    limit = entitlements.ha_limit(manager)
    used = managed_area(manager)
    if limit is not None and used + added_ha > limit:
        raise PlanLimit(
            f"Your plan covers {limit} ha. You manage {used:.0f} ha; "
            f"this farm adds {added_ha:.0f} ha."
        )


def get(producer_id: str) -> dict[str, Any]:
    hit = _STORE.get(PRODUCER, producer_id)
    if hit is None:
        raise KeyError(f"no producer {producer_id}")
    return hit["payload"]


def nearby_profile(lat: float, lon: float) -> dict[str, Any] | None:
    for record in all_profiles():
        if _metres(lat, lon, record["lat"], record["lon"]) <= SAME_PLACE_M:
            return record
    return None


def create(actor: str, actor_buyer_kind: str | None, body: dict[str, Any]) -> dict[str, Any]:
    kind = str(body.get("kind") or "").strip().lower()
    if kind not in KINDS:
        raise ValueError("kind must be individual, household or group")
    name = str(body.get("name") or "").strip()
    if not name or len(name) > 80:
        raise ValueError("name is required (up to 80 characters)")
    try:
        lat, lon = float(body["lat"]), float(body["lon"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("lat and lon are required numbers") from exc
    for_other = actor_buyer_kind is not None
    if for_other and actor_buyer_kind != "cooperative":
        raise PermissionError("only cooperatives can register farmers")
    consent = body.get("consent")
    if for_other and not (isinstance(consent, dict) and consent.get("read_aloud") is True):
        raise ValueError("read the consent text to the farmer and tick that they agreed")
    record: dict[str, Any] = {
        "id": f"pro-{uuid.uuid4().hex[:12]}",
        "kind": kind,
        "name": name,
        "members": _members(body.get("members")),
        "crops": _crops(body.get("crops")),
        "contract_id": str(body.get("contract_id") or "").strip()[:80] or None,
        "wants": _flags(body.get("wants"), WANTS, "wants"),
        "can_offer": _flags(body.get("can_offer"), CAN_OFFER, "can_offer"),
        "lat": lat,
        "lon": lon,
        "public_lat": round(lat, PUBLIC_DECIMALS),
        "public_lon": round(lon, PUBLIC_DECIMALS),
        "village": str(body.get("village") or "").strip()[:80],
        "township": str(body.get("township") or "").strip()[:80],
        "owner": None if for_other else actor,
        "manager": actor if for_other else None,
        "manager_revoked": False,
        "consent": {**consent, "at": now_iso()} if for_other else None,
        "claim_failures": [],
        "device_tokens": [],
        "created_at": now_iso(),
    }
    if total_area(record) > MAX_FARM_HA:
        raise ValueError(f"Farm Map is for farms up to {MAX_FARM_HA:.0f} ha for now")
    existing = nearby_profile(lat, lon)
    if existing is not None:
        raise NearbyProfile(public_view(existing))
    _check_plan(record["manager"], total_area(record))
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
    salt = secrets.token_hex(8)
    record["claim_salt"], record["claim_hash"] = salt, _hash(code, salt)
    pin = str(body.get("pin") or "")
    if pin:
        if not (pin.isdigit() and len(pin) == 4):
            raise ValueError("the PIN must be 4 digits")
        record["pin_hash"] = _hash(pin, salt)
    _STORE.update(PRODUCER, record["id"], lambda _old: record, URL)
    _log("producer_created", {"producer_id": record["id"], "actor": actor, "on_behalf": for_other})
    return {**private_view(record), "claim_code": code}


def private_view(record: dict[str, Any]) -> dict[str, Any]:
    hidden = {"claim_hash", "claim_salt", "pin_hash", "device_tokens", "claim_failures"}
    return {**{k: v for k, v in record.items() if k not in hidden}, "has_pin": "pin_hash" in record}


def can_act(account: str, record: dict[str, Any]) -> bool:
    if record["owner"] is not None and record["owner"] == account:
        return True
    return record["manager"] == account and not record["manager_revoked"]


def require_act(account: str, producer_id: str) -> dict[str, Any]:
    record = get(producer_id)
    if not can_act(account, record):
        raise PermissionError("you cannot act for this farmer")
    return record


def mine(account: str) -> list[dict[str, Any]]:
    return [private_view(r) for r in all_profiles() if can_act(account, r)]


def _change(producer_id: str, fn: Any) -> dict[str, Any]:
    record, _ = _STORE.update(PRODUCER, producer_id, fn, URL)
    return record


def _check_managed_growth(old: dict[str, Any], new: dict[str, Any]) -> None:
    if not old["manager_revoked"]:
        _check_plan(old["manager"], total_area(new) - total_area(old))


def update(account: str, producer_id: str, body: dict[str, Any]) -> dict[str, Any]:
    require_act(account, producer_id)

    def apply(old: dict[str, Any]) -> dict[str, Any]:
        new = dict(old)
        if "name" in body:
            new["name"] = str(body["name"]).strip()[:80] or old["name"]
        if "crops" in body:
            new["crops"] = _crops(body["crops"])
        if "contract_id" in body:
            new["contract_id"] = str(body["contract_id"] or "").strip()[:80] or None
        if "wants" in body:
            new["wants"] = _flags(body["wants"], WANTS, "wants")
        if "can_offer" in body:
            new["can_offer"] = _flags(body["can_offer"], CAN_OFFER, "can_offer")
        if total_area(new) > MAX_FARM_HA:
            raise ValueError(f"Farm Map is for farms up to {MAX_FARM_HA:.0f} ha for now")
        _check_managed_growth(old, new)
        return new

    record = _change(producer_id, apply)
    _log("producer_updated", {"producer_id": producer_id, "actor": account})
    return private_view(record)


def add_member(account: str, producer_id: str, member: dict[str, Any]) -> dict[str, Any]:
    require_act(account, producer_id)

    def apply(old: dict[str, Any]) -> dict[str, Any]:
        new = {**old, "members": old["members"] + _members([member])}
        if total_area(new) > MAX_FARM_HA:
            raise ValueError(f"Farm Map is for farms up to {MAX_FARM_HA:.0f} ha for now")
        _check_managed_growth(old, new)
        return new

    record = _change(producer_id, apply)
    _log("producer_member_added", {"producer_id": producer_id, "actor": account})
    return private_view(record)


def claim(account: str | None, producer_id: str, code: str, pin: str) -> dict[str, Any]:
    record = get(producer_id)
    now = time.time()
    recent = [t for t in record["claim_failures"] if now - t < 3600]
    if len(recent) >= CLAIM_TRIES_PER_HOUR:
        raise PermissionError("too many wrong codes: locked for an hour")
    if not hmac.compare_digest(
        _hash(code.strip().upper(), record["claim_salt"]), record["claim_hash"]
    ):
        _change(producer_id, lambda old: {**old, "claim_failures": recent + [now]})
        raise PermissionError("that code is not right")
    if record["owner"] is not None:
        raise PermissionError("this profile is already claimed")
    if not (pin.isdigit() and len(pin) == 4):
        raise ValueError("the PIN must be 4 digits")
    token = None if account else secrets.token_urlsafe(32)
    owner = account or f"dev:{_token_hash(token)[:24]}"

    def apply(old: dict[str, Any]) -> dict[str, Any]:
        tokens = old["device_tokens"] + ([_token_hash(token)] if token else [])
        return {
            **old,
            "owner": owner,
            "pin_hash": _hash(pin, old["claim_salt"]),
            "claim_failures": [],
            "device_tokens": tokens,
        }

    updated = _change(producer_id, apply)
    _log("producer_claimed", {"producer_id": producer_id, "owner": owner})
    out = private_view(updated)
    if token:
        out["device_token"] = token
    return out


def verify_pin(account: str, producer_id: str, pin: str) -> dict[str, Any]:
    record = require_act(account, producer_id)
    now = time.time()
    recent = [t for t in record["claim_failures"] if now - t < 3600]
    if len(recent) >= CLAIM_TRIES_PER_HOUR:
        raise PermissionError("too many wrong PINs: locked for an hour")
    stored = record.get("pin_hash")
    if stored and not hmac.compare_digest(_hash(pin, record["claim_salt"]), stored):
        _change(producer_id, lambda old: {**old, "claim_failures": recent + [now]})
        raise PermissionError("that PIN is not right")
    return private_view(record)


def account_for_token(token: str) -> str | None:
    digest = _token_hash(token)
    for record in all_profiles():
        if digest in record.get("device_tokens", []):
            return f"dev:{digest[:24]}"
    return None


def revoke_manager(account: str, producer_id: str) -> dict[str, Any]:
    record = get(producer_id)
    if record["owner"] != account:
        raise PermissionError("only the farmer who owns this profile can remove the cooperative")
    updated = _change(producer_id, lambda old: {**old, "manager_revoked": True})
    _log("producer_manager_removed", {"producer_id": producer_id, "actor": account})
    return private_view(updated)


def activity(account: str, producer_id: str) -> list[dict[str, Any]]:
    require_act(account, producer_id)
    entries = get_ledger(get_settings().ledger_path).entries()
    return [e for e in entries if e["payload"].get("producer_id") == producer_id]


def log_listing(producer_id: str, actor: str, listing_id: str) -> None:
    _log("listing_posted", {"producer_id": producer_id, "actor": actor, "listing_id": listing_id})
