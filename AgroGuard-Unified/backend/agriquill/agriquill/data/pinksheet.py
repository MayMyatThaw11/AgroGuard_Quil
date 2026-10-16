from __future__ import annotations

import io
import re
import xml.etree.ElementTree as ET
import zipfile
from typing import Any

import httpx

from ..config import get_settings
from ..store import RecordCache, log_fetch, missing, now_iso, sha256, source_ref

PROVIDER = "World Bank Commodity Price Data (The Pink Sheet), monthly"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
SHEET = "Monthly Prices"
TTL_S = 7 * 24 * 3600.0
CROP_SERIES = {
    "rice": "Rice, Thai 5%",
    "rice_vn": "Rice, Viet Namese 5%",
    "coffee": "Coffee, Robusta",
    "maize": "Maize",
    "palm": "Palm oil",
    "sugarcane": "Sugar, world",
    "tea": "Tea, avg 3 auctions",
    "rubber": "Rubber, TSR20",
    "cocoa": "Cocoa",
}
NO_BENCHMARK = "the World Bank Pink Sheet has no price series for this crop"
_CACHE = RecordCache()


def _column(ref: str) -> str:
    return re.sub(r"\d", "", ref)


def parse(xlsx: bytes) -> dict[str, Any]:
    archive = zipfile.ZipFile(io.BytesIO(xlsx))
    strings = [
        "".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t"))
        for si in ET.fromstring(archive.read("xl/sharedStrings.xml"))
    ]
    book = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rid = next(s.get(REL) for s in book.iter(f"{{{NS['m']}}}sheet") if s.get("name") == SHEET)
    target = next(r.get("Target") for r in rels if r.get("Id") == rid)
    sheet = ET.fromstring(archive.read("xl/" + str(target).lstrip("/").removeprefix("xl/")))

    def cells(row: ET.Element) -> dict[str, str]:
        out: dict[str, str] = {}
        for cell in row:
            value = cell.find("m:v", NS)
            if value is None or value.text is None:
                continue
            text = strings[int(value.text)] if cell.get("t") == "s" else value.text
            out[_column(cell.get("r", ""))] = text.strip()
        return out

    rows = [cells(r) for r in sheet.find("m:sheetData", NS) or []]
    header = next(i for i, r in enumerate(rows) if "Coffee, Robusta" in r.values())
    names, units = rows[header], rows[header + 1]
    updated = next((v for r in rows[:header] for v in r.values() if v.startswith("Updated")), None)
    latest: dict[str, dict[str, Any]] = {}
    for row in rows[header + 2 :]:
        month = row.get("A", "")
        if not re.fullmatch(r"\d{4}M\d{2}", month):
            continue
        for col, name in names.items():
            raw = row.get(col)
            try:
                value = float(raw) if raw else None
            except ValueError:
                value = None
            if value is None:
                continue
            latest[name.rstrip(" *")] = {
                "series": name.rstrip(" *"),
                "month": f"{month[:4]}-{month[5:]}",
                "value": value,
                "unit": units.get(col, "").strip("()"),
            }
    return {"updated": updated, "series": latest}


def per_tonne(entry: dict[str, Any]) -> float | None:
    factor = {"$/mt": 1.0, "$/kg": 1000.0}.get(entry["unit"])
    return None if factor is None else round(entry["value"] * factor, 1)


def benchmarks(client: httpx.Client | None = None) -> dict[str, Any]:
    url = get_settings().pinksheet_url
    cached = _CACHE.get("pinksheet", "monthly")
    if cached and not cached["stale"]:
        parsed, digest, stamp = cached["payload"], cached["sha256"], cached["retrieved_at"]
    else:
        try:
            own = client or httpx.Client(
                timeout=get_settings().http_timeout_s, follow_redirects=True
            )
            try:
                response = own.get(url)
                response.raise_for_status()
            finally:
                if client is None:
                    own.close()
            parsed = parse(response.content)
        except (httpx.HTTPError, KeyError, ValueError, StopIteration, zipfile.BadZipFile) as exc:
            if cached:
                parsed, digest, stamp = cached["payload"], cached["sha256"], cached["retrieved_at"]
            else:
                reason = f"Pink Sheet unavailable: {type(exc).__name__}"
                return {
                    "provider": PROVIDER,
                    "crops": {},
                    "missing": [missing("all", reason)],
                    "source": None,
                }
        else:
            digest, stamp = sha256(response.content), now_iso()
            _CACHE.put("pinksheet", "monthly", parsed, url, digest, TTL_S)
            log_fetch("pinksheet", "monthly", digest)
    crops: dict[str, Any] = {}
    gaps = []
    for crop, series in CROP_SERIES.items():
        entry = parsed["series"].get(series)
        if entry is None:
            gaps.append(missing(crop, f"series {series!r} not found in the workbook"))
            continue
        crops[crop] = {**entry, "usd_per_tonne": per_tonne(entry)}
    return {
        "provider": PROVIDER,
        "provenance": "OFFICIAL_RECORD",
        "updated": parsed["updated"],
        "note": "International benchmark prices, not farm-gate prices",
        "crops": crops,
        "missing": gaps,
        "source": source_ref(PROVIDER, url, stamp, digest),
    }
