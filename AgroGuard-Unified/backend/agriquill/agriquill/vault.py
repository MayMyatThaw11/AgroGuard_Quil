from __future__ import annotations

import hashlib
import os
import re
import secrets
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field

from . import live
from .config import get_settings
from .data import nasapower
from .ledger import get_ledger
from .store import data_path, now_iso

ZONES = (
    "daily",
    "farms",
    "human/scouting_notes",
    "human/verification_checks",
    "machine/telemetry_raw",
    "machine/kalman_water_bands",
    "machine/model_evals",
    "contracts",
    "council",
    "audit",
)
HUMAN = "human"
NOTE_LIMIT = 4096
SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
SOURCE = (
    "Projection of the AgriQill contract store and ledger; the vault is never the source of truth."
)
AGENTS_MD = (Path(__file__).parent / "data" / "vault_agents.md").read_text(encoding="utf-8")

UNKNOWN = {
    "soil_properties": (
        "No soil test on file. The SoilGrids 250 m estimate is in site context, not a test."
    ),
    "financial_state": "No farmer-entered budget, expected yield or price on file.",
    "sensor_confidence_score": (
        "No calibrated sensor confidence model; tube readings carry their own fusion band."
    ),
}


class PaddyEntry(BaseModel):
    id: str
    area_ha: float | None = None
    crop: str | None = None
    crop_id: str | None = None
    stage: str | None = None
    planted: str | None = None
    harvest: str | None = None


class FarmFile(BaseModel):
    farm_id: str
    name: str | None = None
    country: str | None = None
    location: Any = None
    total_area_ha: float | None = None
    paddies: list[PaddyEntry] = Field(default_factory=list)
    herds: int = 0
    contract_sha256: str
    contract_valid: bool
    updated_at: str
    source: str = SOURCE
    missing: dict[str, str] = Field(default_factory=dict)


class VaultError(ValueError):
    pass


def root() -> Path:
    return data_path("vault")


def ensure() -> Path:
    base = root()
    for zone in ZONES:
        (base / zone).mkdir(parents=True, exist_ok=True)
    agents = base / "AGENTS.md"
    if not agents.exists():
        agents.write_text(AGENTS_MD, encoding="utf-8", newline="\n")
    return base


def _check_id(value: str) -> str:
    if not SAFE_ID.match(value):
        raise VaultError(f"unsafe id: {value!r}")
    return value


def _resolve(rel: str) -> Path:
    base = ensure().resolve()
    path = (base / rel).resolve()
    if base not in path.parents:
        raise VaultError(f"path leaves the vault: {rel}")
    return path


def _record(rel: str, data: bytes, by: str) -> dict[str, Any]:
    digest = f"sha256:{hashlib.sha256(data).hexdigest()}"
    entry = get_ledger(get_settings().ledger_path).append(
        "vault_write", {"path": rel, "sha256": digest, "by": by}
    )
    return {"path": rel, "sha256": digest, "ledger_hash": entry.hash}


def write(rel: str, text: str, by: str = "system") -> dict[str, Any]:
    if Path(rel).parts[:1] == (HUMAN,):
        raise VaultError("code never writes the human zone")
    path = _resolve(rel)
    data = text.encode("utf-8")
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)
    return _record(rel, data, by)


def render(front: dict[str, Any], body: str) -> str:
    head = yaml.safe_dump(front, sort_keys=False, allow_unicode=True)
    return f"---\n{head}---\n\n{body.lstrip()}"


def parse(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---\n"):
        raise VaultError("no front matter")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise VaultError("front matter is not closed")
    front = yaml.safe_load(text[4 : end + 1]) or {}
    if not isinstance(front, dict):
        raise VaultError("front matter is not a mapping")
    return front, text[end + 5 :].lstrip("\n")


def _text(value: Any) -> str | None:
    return None if value is None else str(value)


def farm_front(farm_id: str, verdict: dict[str, Any]) -> FarmFile:
    spec = verdict.get("contract") or {"farm": {}, "parcels": []}
    paddies = [
        PaddyEntry(
            id=str(p["id"]),
            area_ha=p.get("area_ha"),
            crop=_text(p.get("crop")),
            crop_id=_text(p.get("crop_id")),
            stage=_text(p.get("stage")),
            planted=_text(p.get("planted")),
            harvest=_text(p.get("harvest")),
        )
        for p in spec["parcels"]
    ]
    areas = [p.area_ha for p in paddies]
    missing = dict(UNKNOWN)
    if not areas or any(a is None for a in areas):
        missing["total_area_ha"] = "At least one parcel has no declared or drawn area."
    farm = spec["farm"]
    return FarmFile(
        farm_id=farm_id,
        name=_text(farm.get("name")),
        country=_text(farm.get("country")),
        location=farm.get("location"),
        total_area_ha=None if "total_area_ha" in missing else round(sum(a or 0 for a in areas), 2),
        paddies=paddies,
        herds=len(spec.get("herds", [])),
        contract_sha256=f"sha256:{verdict['sha256']}",
        contract_valid=bool(verdict["is_valid"]),
        updated_at=now_iso(),
        missing=missing,
    )


def farm_rel(farm_id: str) -> str:
    return f"farms/{_check_id(farm_id)}.md"


def read_farm(farm_id: str) -> tuple[FarmFile, str] | None:
    path = _resolve(farm_rel(farm_id))
    if not path.exists():
        return None
    front, body = parse(path.read_text(encoding="utf-8"))
    return FarmFile.model_validate(front), body


def write_farm(farm_id: str, by: str = "system") -> dict[str, Any]:
    loaded = live.load(farm_id)
    if loaded is None:
        raise KeyError(farm_id)
    front = farm_front(farm_id, loaded[1])
    existing = read_farm(farm_id)
    body = existing[1] if existing else f"# Farm {farm_id} - operational history\n"
    out = write(farm_rel(farm_id), render(front.model_dump(), body), by)
    return {**out, "farm": front.model_dump()}


def append_body(farm_id: str, line: str, by: str = "system") -> dict[str, Any]:
    existing = read_farm(farm_id)
    if existing is None:
        raise KeyError(farm_id)
    front, body = existing
    if line in body.splitlines():
        return {"path": farm_rel(farm_id), "unchanged": True}
    return write(farm_rel(farm_id), render(front.model_dump(), f"{body.rstrip()}\n{line}\n"), by)


def add_note(farm_id: str, text: str, by: str, kind: str = "scouting_notes") -> dict[str, Any]:
    if kind not in ("scouting_notes", "verification_checks"):
        raise VaultError(f"unknown note kind: {kind}")
    body = text.strip()
    if not body:
        raise VaultError("empty note")
    if len(body.encode("utf-8")) > NOTE_LIMIT:
        raise VaultError(f"note is over {NOTE_LIMIT} bytes")
    stamp = now_iso().replace(":", "")
    rel = f"{HUMAN}/{kind}/{_check_id(farm_id)}-{stamp}-{secrets.token_hex(3)}.md"
    path = _resolve(rel)
    data = render(
        {"farm_id": farm_id, "by": by, "at": now_iso(), "kind": kind}, body + "\n"
    ).encode()
    with path.open("xb") as fh:
        fh.write(data)
    return _record(rel, data, by)


def notes(farm_id: str, kind: str = "scouting_notes", limit: int = 20) -> list[dict[str, Any]]:
    folder = ensure() / HUMAN / kind
    files = sorted(folder.glob(f"{_check_id(farm_id)}-*.md"), reverse=True)[:limit]
    out = []
    for f in files:
        front, body = parse(f.read_text(encoding="utf-8"))
        out.append({**front, "text": body.strip(), "path": f"{HUMAN}/{kind}/{f.name}"})
    return out


ET0_LAG_DAYS = 3  # NASA POWER daily values arrive a few days late


def _section(body: str, heading: str, lines: list[str]) -> str:
    block = "\n".join([heading, *lines])
    kept, skip = [], False
    for line in body.rstrip().splitlines():
        if line.startswith("## "):
            skip = line == heading
        if not skip:
            kept.append(line)
    return "\n".join(kept).rstrip() + f"\n\n{block}\n"


def _latlon(location: Any) -> tuple[float, float] | None:
    if isinstance(location, (list, tuple)) and len(location) == 2:
        try:
            return float(location[0]), float(location[1])
        except (TypeError, ValueError):
            return None
    return None


def _depth_lines(farm_id: str, client: Any) -> tuple[list[str], dict[str, Any]]:
    try:
        current = live.build_live(farm_id, client)
    except Exception as exc:  # a failed plan leaves depth unknown, never guessed
        reason = f"live plan failed: {type(exc).__name__}"
        return [f"- Water depth: unknown ({reason})"], {"reason": reason}
    lines, bands = [], {}
    for p in current["paddies"]:
        if p.get("now") is None:
            reason = "; ".join(m["reason"] for m in p.get("missing", [])) or "no fused depth"
            lines.append(f"- {p['id']} water depth: unknown ({reason})")
            bands[p["id"]] = {"now_cm": None, "reason": reason}
        else:
            lines.append(
                f"- {p['id']} water depth: {p['now']} cm, sigma {p['sigma_cm']} cm "
                f"({p['source']}, Kalman filter over tube readings)"
            )
            bands[p["id"]] = {
                "now_cm": p["now"],
                "sigma_cm": p["sigma_cm"],
                "band": p.get("band"),
                "source": p["source"],
            }
    return lines, bands


def _et0_line(location: Any, day: date, client: Any) -> str:
    point = _latlon(location)
    if point is None:
        return "- ET0: unknown (the contract has no lat, lon location)"
    try:
        out = nasapower.et0(point[0], point[1], day, client)
    except Exception as exc:  # network failure leaves the value unknown
        return f"- ET0 {day}: unknown (NASA POWER failed: {type(exc).__name__})"
    if out["et0_mm_day"] is None:
        reason = "; ".join(m["reason"] for m in out["missing"]) or "no value"
        return f"- ET0 {day}: unknown ({reason})"
    return f"- ET0 {day}: {out['et0_mm_day']} mm/day (FAO-56 Penman-Monteith, NASA POWER)"


def dawn_farm(farm_id: str, today: date, client: Any = None) -> dict[str, Any]:
    front = write_farm(farm_id)["farm"]
    depth, bands = _depth_lines(farm_id, client)
    et0_day = today - timedelta(days=ET0_LAG_DAYS)
    lines = [*depth, _et0_line(front["location"], et0_day, client)]
    heading = f"## Dawn sync {today.isoformat()}"
    loaded = read_farm(farm_id)
    assert loaded is not None
    write(farm_rel(farm_id), render(loaded[0].model_dump(), _section(loaded[1], heading, lines)))
    band_front = {"farm_id": farm_id, "date": today.isoformat(), "paddies": bands}
    write(
        f"machine/kalman_water_bands/{farm_id}-{today.isoformat()}.md",
        render(band_front, "Kalman water depth bands from the AgriQill live plan.\n"),
    )
    return {"status": "OK", "lines": lines}


def dawn_sync(client: Any = None, today: date | None = None) -> dict[str, Any]:
    day = today or date.today()
    farms: dict[str, Any] = {}
    for row in live.listing():
        farm_id = row["farm_id"]
        try:
            farms[farm_id] = dawn_farm(farm_id, day, client)
        except Exception as exc:  # one broken farm must not stop the others
            farms[farm_id] = {"status": "FAILED", "error": f"{type(exc).__name__}: {exc}"[:300]}
    daily = [f"# Dawn sync {day.isoformat()}", ""]
    for farm_id, result in farms.items():
        daily.append(f"## {farm_id}")
        daily.extend(result.get("lines") or [f"- failed: {result.get('error')}"])
        daily.append("")
    write(f"daily/{day.isoformat()}.md", "\n".join(daily))
    return {"date": day.isoformat(), "farms": farms}
