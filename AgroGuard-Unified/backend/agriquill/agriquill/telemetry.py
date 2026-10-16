from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from .config import get_settings
from .ledger import get_ledger
from .store import connect, data_path, now_iso, sha256

DB = "telemetry.sqlite"
SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
    device_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    source TEXT NOT NULL,
    reporter TEXT,
    sha256 TEXT NOT NULL,
    evidence TEXT,
    PRIMARY KEY (device_id, metric, observed_at)
)
"""
PHOTO_MAX_BYTES = 2_000_000
PHOTO_TYPES = {b"\xff\xd8\xff": "jpg", b"\x89PNG": "png"}
METRICS: dict[str, tuple[str, float, float]] = {
    "water_depth_cm": ("cm", -40.0, 30.0),
    "wind_ms": ("m/s", 0.0, 60.0),
    "temperature_c": ("C", -10.0, 60.0),
    "humidity_pct": ("%", 0.0, 100.0),
    "rain_mm": ("mm", 0.0, 500.0),
    "battery_v": ("V", 0.0, 5.0),
    "dissolved_oxygen_mg_l": ("mg/L", 0.0, 20.0),
    "water_temp_c": ("C", 0.0, 45.0),
    "head_count": ("head", 0.0, 1_000_000.0),
    "feed_kg": ("kg", 0.0, 100_000.0),
    "mortality": ("head", 0.0, 1_000_000.0),
}
STALE_AFTER_H = {"lorawan": 6.0, "agroguard": 6.0, "manual": 72.0}
STUCK_READINGS = 6
ALIASES = {
    "water_depth": "water_depth_cm",
    "depth_cm": "water_depth_cm",
    "water_level_cm": "water_depth_cm",
    "wind": "wind_ms",
    "wind_speed": "wind_ms",
    "wind_speed_ms": "wind_ms",
    "temperature": "temperature_c",
    "temp_c": "temperature_c",
    "humidity": "humidity_pct",
    "relative_humidity": "humidity_pct",
    "rh_pct": "humidity_pct",
    "rain": "rain_mm",
    "rainfall_mm": "rain_mm",
    "battery": "battery_v",
    "bat_v": "battery_v",
    "do": "dissolved_oxygen_mg_l",
    "dissolved_oxygen": "dissolved_oxygen_mg_l",
    "water_temperature": "water_temp_c",
}
MAX_CLOCK_SKEW = timedelta(minutes=5)


class TelemetryError(ValueError):
    pass


def _conn() -> Any:
    conn, lock = connect(DB)
    with lock:
        conn.execute(SCHEMA)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(readings)")}
        if "evidence" not in columns:
            conn.execute("ALTER TABLE readings ADD COLUMN evidence TEXT")
    return conn, lock


def save_photo(data: bytes) -> str:
    if len(data) > PHOTO_MAX_BYTES:
        raise TelemetryError(f"photo is larger than {PHOTO_MAX_BYTES // 1000} kB")
    ext = next((e for magic, e in PHOTO_TYPES.items() if data.startswith(magic)), None)
    if ext is None:
        raise TelemetryError("photo must be a JPEG or PNG image")
    digest = sha256(data)
    folder = data_path("evidence")
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{digest.split(':')[1]}.{ext}").write_bytes(data)
    return digest


def _moment(value: str) -> str:
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise TelemetryError(f"observed_at {value!r} is not an ISO timestamp") from exc
    if moment.tzinfo is None:
        raise TelemetryError("observed_at must carry a timezone")
    moment = moment.astimezone(UTC)
    if moment > datetime.now(UTC) + MAX_CLOCK_SKEW:
        raise TelemetryError("observed_at is in the future")
    return moment.isoformat(timespec="seconds")


def ingest(
    device_id: str,
    observed_at: str,
    values: dict[str, Any],
    source: str,
    reporter: str | None = None,
    evidence: str | None = None,
) -> dict[str, Any]:
    if not device_id or len(device_id) > 120:
        raise TelemetryError("device_id is required and at most 120 characters")
    stamp = _moment(observed_at)
    stored: list[dict[str, Any]] = []
    rejected: list[dict[str, str]] = []
    received = now_iso()
    conn, lock = _conn()
    for raw_key, raw in values.items():
        metric = ALIASES.get(raw_key, raw_key)
        if metric not in METRICS:
            rejected.append({"field": raw_key, "reason": "unknown metric"})
            continue
        unit, lo, hi = METRICS[metric]
        if isinstance(raw, bool) or not isinstance(raw, (int, float)) or raw != raw:
            rejected.append({"field": raw_key, "reason": "not a number"})
            continue
        if not lo <= float(raw) <= hi:
            rejected.append({"field": raw_key, "reason": f"outside plausible range {lo}..{hi}"})
            continue
        row = {
            "device_id": device_id,
            "metric": metric,
            "value": float(raw),
            "unit": unit,
            "observed_at": stamp,
            "received_at": received,
            "source": source,
            "reporter": reporter,
            "evidence": evidence,
        }
        row["sha256"] = sha256(json.dumps(row, sort_keys=True).encode("utf-8"))
        with lock:
            cur = conn.execute(
                "INSERT OR IGNORE INTO readings (device_id, metric, value, unit, observed_at, "
                "received_at, source, reporter, sha256, evidence) VALUES (:device_id, :metric, "
                ":value, :unit, :observed_at, :received_at, :source, :reporter, :sha256, "
                ":evidence)",
                row,
            )
            conn.commit()
        if cur.rowcount:
            stored.append(row)
    if stored:
        get_ledger(get_settings().ledger_path).append(
            "telemetry_ingested",
            {
                "device_id": device_id,
                "observed_at": stamp,
                "source": source,
                "readings": [{"metric": r["metric"], "sha256": r["sha256"]} for r in stored],
            },
        )
    return {"device_id": device_id, "observed_at": stamp, "stored": stored, "rejected": rejected}


def latest(device_id: str, metric: str) -> dict[str, Any] | None:
    conn, lock = _conn()
    with lock:
        row = conn.execute(
            "SELECT * FROM readings WHERE device_id = ? AND metric = ? "
            "ORDER BY observed_at DESC LIMIT 1",
            (device_id, metric),
        ).fetchone()
    return dict(row) if row else None


def series(device_id: str, metric: str, since: str | None = None) -> list[dict[str, Any]]:
    conn, lock = _conn()
    with lock:
        rows = conn.execute(
            "SELECT * FROM readings WHERE device_id = ? AND metric = ? AND observed_at >= ? "
            "ORDER BY observed_at",
            (device_id, metric, since or ""),
        ).fetchall()
    return [dict(r) for r in rows]


def health(device_id: str, metric: str) -> dict[str, Any]:
    recent = series(device_id, metric, (datetime.now(UTC) - timedelta(days=14)).isoformat())
    out: dict[str, Any] = {"device_id": device_id, "metric": metric, "issues": []}
    if not recent:
        out.update(status="silent", last_seen=None)
        out["issues"].append("no reading in 14 days")
        return out
    last = recent[-1]
    age_h = (datetime.now(UTC) - datetime.fromisoformat(last["observed_at"])).total_seconds() / 3600
    kind = last["source"].split(":")[0]
    out.update(
        last_seen=last["observed_at"],
        last_source=last["source"],
        age_h=round(age_h, 1),
        readings_24h=sum(
            1
            for r in recent
            if datetime.fromisoformat(r["observed_at"]) >= datetime.now(UTC) - timedelta(hours=24)
        ),
    )
    if age_h > STALE_AFTER_H.get(kind, 24.0):
        out["issues"].append(f"stale: last {kind} reading {round(age_h)} h ago")
    sensed = [r["value"] for r in recent if r["source"].startswith("lorawan")][-STUCK_READINGS:]
    if len(sensed) == STUCK_READINGS and max(sensed) - min(sensed) < 0.05:
        out["issues"].append(f"stuck: last {STUCK_READINGS} sensor readings identical")
    battery = latest(device_id, "battery_v")
    if battery is not None:
        out["battery_v"] = battery["value"]
    out["status"] = "ok" if not out["issues"] else "attention"
    return out


def daily_means(device_id: str, metric: str, days: int) -> list[float | None]:
    start = (datetime.now(UTC) - timedelta(days=days)).date()
    buckets: dict[str, list[float]] = {}
    for row in series(device_id, metric, start.isoformat()):
        buckets.setdefault(row["observed_at"][:10], []).append(row["value"])
    out: list[float | None] = []
    for offset in range(days):
        key = (start + timedelta(days=offset + 1)).isoformat()
        values = buckets.get(key)
        out.append(round(sum(values) / len(values), 2) if values else None)
    return out


def parse_ttn(body: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
    try:
        device = body["end_device_ids"]["device_id"]
        uplink = body["uplink_message"]
    except (KeyError, TypeError) as exc:
        raise TelemetryError("not a The Things Stack uplink message") from exc
    decoded = uplink.get("decoded_payload")
    if not isinstance(decoded, dict):
        raise TelemetryError("uplink has no decoded_payload; configure a payload formatter")
    stamp = body.get("received_at") or uplink.get("received_at")
    if not stamp:
        raise TelemetryError("uplink has no received_at")
    return str(device), str(stamp), decoded


def parse_chirpstack(body: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
    info = body.get("deviceInfo")
    if not isinstance(info, dict) or not (info.get("deviceName") or info.get("devEui")):
        raise TelemetryError("not a ChirpStack uplink event")
    decoded = body.get("object")
    if not isinstance(decoded, dict):
        raise TelemetryError("uplink has no decoded object; configure a device codec")
    if not body.get("time"):
        raise TelemetryError("uplink has no time")
    return str(info.get("deviceName") or info["devEui"]), str(body["time"]), decoded
