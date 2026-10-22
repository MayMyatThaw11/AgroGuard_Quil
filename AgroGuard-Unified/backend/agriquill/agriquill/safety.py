from __future__ import annotations

import csv
import hashlib
import hmac
import threading
import time
import uuid
from collections import deque
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .config import get_settings

ANNEX_FILE = Path(__file__).parent / "data" / "prohibited_inputs.csv"
BLOCKING_RULES = frozenset({"prohibited", "not_authorised"})


def annex_rows(standard: str | None = None) -> list[dict[str, str]]:
    """Rows built from fetched regulation text, one per item, each with its clause."""
    with ANNEX_FILE.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    return rows if standard is None else [r for r in rows if r["standard"] == standard]


# Mirrors src/lib/safety.ts. Server is authoritative; the UI mirror is advisory.
PROHIBITED_INPUTS: dict[str, tuple[str, ...]] = {}
for _row in annex_rows():
    if _row["rule"] in BLOCKING_RULES:
        PROHIBITED_INPUTS[_row["standard"]] = (
            *PROHIBITED_INPUTS.get(_row["standard"], ()),
            _row["item"],
        )


STANDARD_ALIASES: dict[str, str] = {
    "ASOA_ORGANIC_V2": "ASEAN_ORGANIC_ASOA",
    "ASOA_ORGANIC": "ASEAN_ORGANIC_ASOA",
}


NO_STANDARD = frozenset({"", "none", "none declared"})


def resolve_standard(standard: str | None) -> str | None:
    name = (standard or "").strip()
    if name.lower() in NO_STANDARD:
        return None
    return STANDARD_ALIASES.get(name, name)


def prohibited_for(standard: str | None) -> tuple[str, ...] | None:
    resolved = resolve_standard(standard)
    return PROHIBITED_INPUTS.get(resolved) if resolved else None


def all_prohibited_inputs() -> set[str]:
    return {item for items in PROHIBITED_INPUTS.values() for item in items}


def conditional_for(standard: str | None) -> list[dict[str, str]]:
    resolved = resolve_standard(standard)
    return [r for r in annex_rows(resolved) if r["rule"] == "conditional"] if resolved else []


def clause_for(standard: str | None, item: str) -> str | None:
    resolved = resolve_standard(standard)
    row = next((r for r in annex_rows(resolved) if r["item"] == item), None) if resolved else None
    return row["clause"] if row else None


class SafetyError(ValueError):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


def check_wind(wind_speed_ms: float | None) -> None:
    s = get_settings()
    if wind_speed_ms is None or wind_speed_ms != wind_speed_ms or wind_speed_ms < 0:
        raise SafetyError("REJECTED_INVALID_TELEMETRY", "wind telemetry absent or invalid")
    if wind_speed_ms > s.wind_ceiling_ms:
        raise SafetyError(
            "REJECTED_WIND_EXCEEDED",
            f"wind {wind_speed_ms} m/s exceeds ceiling {s.wind_ceiling_ms} m/s",
        )


def check_prohibited(declared: list[str], standard: str | None) -> str | None:
    if resolve_standard(standard) is None:
        return None
    prohibited = prohibited_for(standard)
    if prohibited is None:
        return (
            f"No banned-input check ran: AgriQill has no list for {standard} (TO VERIFY against "
            "the standard's own list before field use)."
        )
    lowered = {token.lower() for token in prohibited}
    for item in declared:
        if item.strip().lower() in lowered:
            raise SafetyError("REJECTED_PROHIBITED_INPUT", f"{item!r} prohibited under {standard}")
    return None


def check_duration(minutes: float) -> None:
    s = get_settings()
    if not isinstance(minutes, (int, float)) or minutes != minutes or minutes <= 0:
        raise SafetyError("REJECTED_INVALID_TELEMETRY", "duration must be a positive number")
    if minutes > s.valve_max_minutes:
        raise SafetyError(
            "REJECTED_DURATION_EXCEEDED", f"{minutes} min exceeds {s.valve_max_minutes} min clamp"
        )


TOKEN_TTL_S = 600
TOKEN_SCHEMA = """
CREATE TABLE IF NOT EXISTS challenge_tokens (
    token TEXT PRIMARY KEY,
    target TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    created_at REAL NOT NULL,
    redeemed INTEGER NOT NULL DEFAULT 0
)
"""


def _tokens() -> Any:
    from .store import connect

    conn, lock = connect("safety.sqlite")
    with lock:
        conn.execute(TOKEN_SCHEMA)
    return conn, lock


def _compute_payload_hash(
    target: str,
    standard: str | None,
    declared_inputs: list[str] | None,
    requested_minutes: float | None,
) -> str:
    raw = f"{target}|{standard or ''}|{sorted(declared_inputs or [])}|{requested_minutes}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def issue_challenge_token(target: str, payload_hash: str) -> str:
    token = f"tok_{uuid.uuid4().hex}"
    conn, lock = _tokens()
    with lock:
        conn.execute(
            "INSERT INTO challenge_tokens VALUES (?, ?, ?, ?, 0)",
            (token, target, payload_hash, time.time()),
        )
        conn.commit()
    return token


def verify_and_redeem_token(token: str | None, target: str, payload_hash: str) -> None:
    if not token:
        raise SafetyError(
            "REJECTED_TOKEN_MISSING",
            "phase B needs the single-use challenge token issued in phase A",
        )
    conn, lock = _tokens()
    with lock:
        record = conn.execute("SELECT * FROM challenge_tokens WHERE token = ?", (token,)).fetchone()
        if record is None:
            raise SafetyError("REJECTED_INVALID_TOKEN", "actuation challenge token not found")
        if record["redeemed"]:
            raise SafetyError(
                "REJECTED_TOKEN_ALREADY_USED",
                "actuation challenge token has already been redeemed",
            )
        if record["target"] != target or record["payload_hash"] != payload_hash:
            raise SafetyError(
                "REJECTED_TOKEN_MISMATCH",
                "challenge token does not match target actuation payload",
            )
        if time.time() - record["created_at"] > TOKEN_TTL_S:
            raise SafetyError(
                "REJECTED_TOKEN_EXPIRED", f"challenge token expired (TTL {TOKEN_TTL_S}s)"
            )
        cur = conn.execute(
            "UPDATE challenge_tokens SET redeemed = 1 WHERE token = ? AND redeemed = 0", (token,)
        )
        conn.commit()
        if cur.rowcount != 1:
            raise SafetyError(
                "REJECTED_TOKEN_ALREADY_USED",
                "actuation challenge token has already been redeemed",
            )


RATE_LIMITED = "REJECTED_RATE_LIMITED"
ISSUE_WINDOW_S = 60.0

# Sliding-window counters, in memory and per server process: they reset on a
# restart and are not shared between workers. Fine for the single-process
# server today; a multi-worker deployment needs a shared store.
_clock: Callable[[], float] = time.monotonic
_limit_lock = threading.Lock()
_pin_failures: dict[str, deque[float]] = {}
_issued: dict[str, deque[float]] = {}
GLOBAL = "*"


def reset_rate_limits() -> None:
    with _limit_lock:
        _pin_failures.clear()
        _issued.clear()


def _recent(store: dict[str, deque[float]], key: str, window_s: float) -> int:
    hits = store.get(key)
    if not hits:
        return 0
    cutoff = _clock() - window_s
    while hits and hits[0] <= cutoff:
        hits.popleft()
    return len(hits)


def _note(store: dict[str, deque[float]], *keys: str) -> None:
    now = _clock()
    for key in keys:
        store.setdefault(key, deque()).append(now)


def check_pin_lockout(caller: str) -> None:
    """Refuse a PIN attempt from a caller (or the whole server) with too many recent misses."""
    s = get_settings()
    with _limit_lock:
        too_many = (
            _recent(_pin_failures, caller, s.pin_failure_window_s) >= s.pin_failures_per_caller
            or _recent(_pin_failures, GLOBAL, s.pin_failure_window_s) >= s.pin_failures_global
        )
    if too_many:
        raise SafetyError(
            RATE_LIMITED,
            f"too many wrong PINs; wait {int(s.pin_failure_window_s // 60)} minutes and try again",
        )


def record_pin_failure(caller: str) -> None:
    with _limit_lock:
        _note(_pin_failures, caller, GLOBAL)


def check_issue_limit(caller: str, farm: str | None) -> None:
    """Cap how fast approval tokens can be requested, per caller, per farm and overall.

    Every wrong PIN costs a fresh token, so this is what bounds PIN guessing.
    """
    s = get_settings()
    keyed = [caller] + ([f"farm:{farm}"] if farm else [])
    with _limit_lock:
        over_key = any(
            _recent(_issued, key, ISSUE_WINDOW_S) >= s.approvals_per_minute_per_caller
            for key in keyed
        )
        over_all = _recent(_issued, GLOBAL, ISSUE_WINDOW_S) >= s.approvals_per_minute_global
        if not (over_key or over_all):
            _note(_issued, *keyed, GLOBAL)
    if over_key or over_all:
        raise SafetyError(RATE_LIMITED, "too many approval requests; wait a minute and try again")


def check_approval(pin: str | None, confirmed: bool) -> None:
    if not confirmed:
        raise SafetyError("REJECTED_APPROVAL_MISSING", "operator has not confirmed")
    expected = get_settings().actuation_pin
    if expected is None:
        raise SafetyError(
            "REJECTED_APPROVAL_NOT_CONFIGURED",
            "no operator PIN is configured; set AGRIQUILL_ACTUATION_PIN on the server",
        )
    if not pin or not hmac.compare_digest(pin.strip(), expected.get_secret_value()):
        raise SafetyError(
            "REJECTED_PIN_MISMATCH", "operator PIN does not match; start again from phase A"
        )


def evaluate_actuation(
    target: str,
    *,
    wind_speed_ms: float | None = None,
    declared_inputs: list[str] | None = None,
    standard: str | None = None,
    approval_pin: str | None = None,
    operator_confirmed: bool = False,
    challenge_token: str | None = None,
    requested_minutes: float | None = None,
    rate_key: str | None = None,
    farm_key: str | None = None,
    issue_token: bool = True,
) -> dict[str, Any]:
    """Run the gates and the two-phase human approval.

    `rate_key` names the caller for the approval rate limits. The network
    routes always pass it; None (in-process callers such as tests) is unlimited.
    `issue_token=False` makes phase A a dry run for callers that must never be
    able to finish an approval (the MCP agent): gates run, no token is minted.
    """
    passed: list[str] = []
    notes: list[str] = []
    payload_hash = _compute_payload_hash(target, standard, declared_inputs, requested_minutes)
    try:
        # Pre-flight gate 1: wind speed (hard safety cutoff <= 5.5 m/s)
        if target == "drone":
            check_wind(wind_speed_ms)
            passed.append("gate1_wind")

        # Pre-flight gate 2: compliance / prohibited agrochemicals
        note = check_prohibited(declared_inputs or [], standard)
        if note:
            notes.append(note)
        passed.append("gate2_compliance")

        # Pre-flight gate 4: duration clamp for irrigation valves
        if target == "irrigation_valve":
            check_duration(requested_minutes if requested_minutes is not None else float("nan"))
            passed.append("gate4_duration_clamp")

        # Two-phase human confirmation (AGENTS.md hard rule 6)
        # Phase A: If not confirmed yet, issue a single-use token bound to payload hash
        if not operator_confirmed:
            token = None
            if issue_token:
                if rate_key is not None:
                    check_issue_limit(rate_key, farm_key)
                token = issue_challenge_token(target, payload_hash)
            return {
                "status": "PENDING_APPROVAL",
                "target": target,
                "challenge_token": token,
                "payload_hash": payload_hash,
                "gatesPassed": passed,
                "notes": notes,
                "failure": {
                    "code": "REJECTED_APPROVAL_MISSING",
                    "detail": (
                        "Phase A challenge token issued; operator confirmation and PIN required"
                        if token
                        else "Gates passed; a named person must approve this in the app"
                    ),
                },
            }

        # Phase B: Operator confirmation with PIN and token redemption
        if rate_key is not None:
            check_pin_lockout(rate_key)
        verify_and_redeem_token(challenge_token, target, payload_hash)
        try:
            check_approval(approval_pin, operator_confirmed)
        except SafetyError as exc:
            if exc.code == "REJECTED_PIN_MISMATCH" and rate_key is not None:
                record_pin_failure(rate_key)
            raise
        passed.append("gate3_challenge_token_verified")

        # Re-verify wind at transmission time for physical drone actuation
        if target == "drone":
            check_wind(wind_speed_ms)
            passed.append("gate1_wind_transmission_verified")

        passed.append("gate3_human_approval")
        return {
            "status": "PERMITTED",
            "target": target,
            "gatesPassed": passed,
            "notes": notes,
            "challenge_token": challenge_token,
            "failure": None,
        }
    except SafetyError as exc:
        status = "PENDING_APPROVAL" if exc.code == "REJECTED_APPROVAL_MISSING" else "REJECTED"
        return {
            "status": status,
            "target": target,
            "gatesPassed": passed,
            "notes": notes,
            "failure": {"code": exc.code, "detail": exc.detail},
        }
