from __future__ import annotations

import csv
import hashlib
import io
import json
import sqlite3
import time
import zipfile
from datetime import UTC, datetime
from typing import Any

import httpx

from ..config import get_settings
from ..store import connect, data_path, log_fetch, missing, now_iso, sha256, source_ref

DB_NAME = "fao_knowledge.sqlite"
FAOSTAT = "FAOSTAT QCL, Crops and livestock products (FAO)"
CROP_CALENDAR = "FAO Crop Calendar (cropcalendar.apps.fao.org)"
REQUEST_GAP_S = 1.0
BATCH = 5000

COUNTRIES: dict[str, dict[str, Any]] = {
    "BRN": {"fao": 26, "m49": "096", "iso2": "BN", "name": "Brunei Darussalam"},
    "KHM": {"fao": 115, "m49": "116", "iso2": "KH", "name": "Cambodia"},
    "IDN": {"fao": 101, "m49": "360", "iso2": "ID", "name": "Indonesia"},
    "LAO": {"fao": 120, "m49": "418", "iso2": "LA", "name": "Lao People's Democratic Republic"},
    "MYS": {"fao": 131, "m49": "458", "iso2": "MY", "name": "Malaysia"},
    "MMR": {"fao": 28, "m49": "104", "iso2": "MM", "name": "Myanmar"},
    "PHL": {"fao": 171, "m49": "608", "iso2": "PH", "name": "Philippines"},
    "SGP": {"fao": 200, "m49": "702", "iso2": "SG", "name": "Singapore"},
    "THA": {"fao": 216, "m49": "764", "iso2": "TH", "name": "Thailand"},
    "TLS": {"fao": 176, "m49": "626", "iso2": "TL", "name": "Timor-Leste"},
    "VNM": {"fao": 237, "m49": "704", "iso2": "VN", "name": "Viet Nam"},
    "WLD": {"fao": 5000, "m49": "001", "iso2": "", "name": "World"},
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS qcl (
    area_code INTEGER, area TEXT, item_code INTEGER, item TEXT, cpc TEXT,
    element_code INTEGER, element TEXT, year INTEGER, unit TEXT,
    value REAL, flag TEXT, note TEXT
);
CREATE INDEX IF NOT EXISTS qcl_lookup ON qcl (area_code, item_code, element, year);
CREATE TABLE IF NOT EXISTS flags (flag TEXT PRIMARY KEY, description TEXT);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS crop_calendar (
    iso3 TEXT, crop_id TEXT, crop TEXT, aez_id TEXT, aez TEXT, last_updated TEXT, sessions TEXT
);
CREATE INDEX IF NOT EXISTS calendar_lookup ON crop_calendar (iso3, crop);
CREATE TABLE IF NOT EXISTS calendar_status (
    iso3 TEXT PRIMARY KEY, status TEXT, url TEXT, sha256 TEXT, retrieved_at TEXT
);
"""


def _db() -> tuple[sqlite3.Connection, Any]:
    conn, lock = connect(DB_NAME)
    with lock:
        conn.executescript(SCHEMA)
    return conn, lock


def resolve_country(country: str) -> str:
    key = country.strip().upper()
    if key in COUNTRIES:
        return key
    for iso3, info in COUNTRIES.items():
        if key in (info["iso2"], info["m49"], str(info["fao"]), info["name"].upper()):
            return iso3
    raise KeyError(f"country {country} is not in the packed set {sorted(COUNTRIES)}")


def _meta(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return None if row is None else row["value"]


def download_faostat(client: httpx.Client | None = None) -> dict[str, str]:
    s = get_settings()
    target = data_path("faostat_qcl.zip")
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(".part")
    digest = hashlib.sha256()
    own = client or httpx.Client(timeout=120, follow_redirects=True)
    try:
        with own.stream("GET", s.faostat_bulk_url) as response:
            response.raise_for_status()
            last_modified = response.headers.get("last-modified", "")
            with partial.open("wb") as fh:
                for chunk in response.iter_bytes(1 << 20):
                    digest.update(chunk)
                    fh.write(chunk)
    finally:
        if client is None:
            own.close()
    partial.replace(target)
    return {
        "path": str(target),
        "sha256": "sha256:" + digest.hexdigest(),
        "last_modified": last_modified,
    }


def pack_faostat(
    zip_path: str, digest: str, last_modified: str, countries: list[str] | None = None
) -> dict[str, Any]:
    wanted = {COUNTRIES[c]["fao"] for c in (countries or list(COUNTRIES))}
    conn, lock = _db()
    rows: list[tuple[Any, ...]] = []
    total = 0

    def flush() -> None:
        with lock:
            conn.executemany("INSERT INTO qcl_new VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows)
        rows.clear()

    with lock:
        conn.execute("DROP TABLE IF EXISTS qcl_new")
        conn.execute("CREATE TABLE qcl_new AS SELECT * FROM qcl WHERE 0")
    with zipfile.ZipFile(zip_path) as archive:
        main = next(n for n in archive.namelist() if n.endswith("All_Data_(Normalized).csv"))
        flag_name = next(n for n in archive.namelist() if n.endswith("_Flags.csv"))
        flags = list(csv.reader(io.TextIOWrapper(archive.open(flag_name), encoding="utf-8")))[1:]
        with archive.open(main) as raw:
            for row in csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8", newline="")):
                if int(row["Area Code"]) not in wanted:
                    continue
                value = row["Value"].strip()
                rows.append(
                    (
                        int(row["Area Code"]),
                        row["Area"],
                        int(row["Item Code"]),
                        row["Item"],
                        row["Item Code (CPC)"].lstrip("'"),
                        int(row["Element Code"]),
                        row["Element"],
                        int(row["Year"]),
                        row["Unit"],
                        float(value) if value else None,
                        row["Flag"],
                        row["Note"],
                    )
                )
                total += 1
                if len(rows) >= BATCH:
                    flush()
    flush()
    with lock:
        conn.execute("DROP TABLE qcl")
        conn.execute("ALTER TABLE qcl_new RENAME TO qcl")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS qcl_lookup ON qcl (area_code, item_code, element, year)"
        )
        conn.execute("DELETE FROM flags")
        conn.executemany(
            "INSERT INTO flags VALUES (?, ?)", [(f[0].strip(), f[1].strip()) for f in flags]
        )
        info = {
            "faostat_url": get_settings().faostat_bulk_url,
            "faostat_sha256": digest,
            "faostat_last_modified": last_modified,
            "faostat_packed_at": now_iso(),
            "faostat_rows": str(total),
        }
        conn.executemany("INSERT OR REPLACE INTO meta VALUES (?, ?)", list(info.items()))
        conn.commit()
    log_fetch("faostat_bulk", "qcl", digest)
    return {"rows": total, "sha256": digest, "last_modified": last_modified}


def sync_faostat(countries: list[str] | None = None) -> dict[str, Any]:
    got = download_faostat()
    return pack_faostat(got["path"], got["sha256"], got["last_modified"], countries)


def _flags(conn: sqlite3.Connection) -> dict[str, str]:
    return {r["flag"]: r["description"] for r in conn.execute("SELECT * FROM flags")}


def faostat_qcl(
    country: str,
    item: str,
    element: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    live: bool = False,
) -> dict[str, Any]:
    iso3 = resolve_country(country)
    if live:
        return faostat_live(iso3, item, element, year_from, year_to)
    conn, lock = _db()
    with lock:
        packed_at = _meta(conn, "faostat_packed_at")
        if packed_at is None:
            return {
                "provider": FAOSTAT,
                "country": iso3,
                "records": [],
                "missing": [missing("all", "FAOSTAT is not packed yet: run job faostat_sync")],
                "source": None,
            }
        code = COUNTRIES[iso3]["fao"]
        found = _match_item(conn, code, item)
        if isinstance(found, dict):
            return found | {"provider": FAOSTAT, "country": iso3, "source": None}
        sql = "SELECT * FROM qcl WHERE area_code = ? AND item_code = ?"
        args: list[Any] = [code, found]
        if element:
            sql += " AND lower(element) = lower(?)"
            args.append(element)
        if year_from is not None:
            sql += " AND year >= ?"
            args.append(year_from)
        if year_to is not None:
            sql += " AND year <= ?"
            args.append(year_to)
        rows = conn.execute(sql + " ORDER BY element, year", args).fetchall()
        flags = _flags(conn)
        meta = {
            k: _meta(conn, k) for k in ("faostat_url", "faostat_sha256", "faostat_last_modified")
        }
    records = [
        {
            "area": r["area"],
            "item": r["item"],
            "item_code": r["item_code"],
            "element": r["element"],
            "year": r["year"],
            "value": r["value"],
            "unit": r["unit"],
            "flag": r["flag"],
            "flag_meaning": flags.get(r["flag"], "unknown flag"),
        }
        for r in rows
    ]
    gaps = [
        missing(f"{r['element']}@{r['year']}", f"FAOSTAT has no value (flag {r['flag'] or 'none'})")
        for r in records
        if r["value"] is None
    ]
    if not records:
        gaps.append(missing("all", "no FAOSTAT rows match this filter"))
    return {
        "provider": FAOSTAT,
        "provenance": "OFFICIAL_RECORD",
        "country": iso3,
        "records": records,
        "missing": gaps,
        "source_updated": meta["faostat_last_modified"],
        "packed_at": packed_at,
        "source": source_ref(
            FAOSTAT, meta["faostat_url"] or "", packed_at, meta["faostat_sha256"] or ""
        ),
    }


def _match_item(conn: sqlite3.Connection, area_code: int, item: str) -> int | dict[str, Any]:
    if item.strip().isdigit():
        return int(item)
    rows = conn.execute(
        "SELECT DISTINCT item_code, item FROM qcl WHERE area_code = ? AND lower(item) = lower(?)",
        (area_code, item.strip()),
    ).fetchall()
    if len(rows) == 1:
        return rows[0]["item_code"]
    near = conn.execute(
        "SELECT DISTINCT item_code, item FROM qcl WHERE area_code = ? AND lower(item) LIKE ? "
        "ORDER BY item LIMIT 20",
        (area_code, f"%{item.strip().lower()}%"),
    ).fetchall()
    if len(near) == 1:
        return near[0]["item_code"]
    return {
        "records": [],
        "candidates": [{"item_code": r["item_code"], "item": r["item"]} for r in near],
        "missing": [
            missing(
                "item", "ambiguous item: pick an item_code" if near else f"no item matches {item}"
            )
        ],
    }


def _token(client: httpx.Client) -> str | None:
    s = get_settings()
    if s.faostat_username and s.faostat_password:
        response = client.post(
            f"{s.faostat_api}/auth/login",
            data={
                "username": s.faostat_username,
                "password": s.faostat_password.get_secret_value(),
            },
        )
        response.raise_for_status()
        body = response.json()
        for key, value in body.items():
            if "access" in key.lower() and "token" in key.lower() and isinstance(value, str):
                return value
    return s.faostat_token.get_secret_value() if s.faostat_token else None


def faostat_live(
    iso3: str,
    item: str,
    element: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    s = get_settings()
    out: dict[str, Any] = {
        "provider": FAOSTAT + " live API",
        "country": iso3,
        "records": [],
        "source": None,
    }
    if not item.strip().isdigit():
        out["missing"] = [missing("item", "the live API needs a numeric FAOSTAT item code")]
        return out
    params: dict[str, str] = {"area": str(COUNTRIES[iso3]["fao"]), "item": item.strip()}
    if year_from is not None or year_to is not None:
        lo = year_from or 1961
        hi = year_to or datetime.now(UTC).year
        params["year"] = ",".join(str(y) for y in range(lo, hi + 1))
    own = client or httpx.Client(timeout=s.http_timeout_s)
    try:
        token = _token(own)
        if token is None:
            out["missing"] = [missing("all", "no FAOSTAT token or login configured")]
            return out
        response = own.get(
            f"{s.faostat_api}/en/data/QCL",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )
        if response.status_code in (401, 403):
            out["missing"] = [
                missing("all", f"FAOSTAT API refused the token (HTTP {response.status_code})")
            ]
            return out
        response.raise_for_status()
        body = response.content
        data = response.json().get("data") or []
    except (httpx.HTTPError, ValueError) as exc:
        out["missing"] = [missing("all", f"FAOSTAT API unavailable: {type(exc).__name__}")]
        return out
    finally:
        if client is None:
            own.close()
    rows = [d for d in data if not element or d.get("Element", "").lower() == element.lower()]
    out["records"] = [
        {
            "area": d.get("Area"),
            "item": d.get("Item"),
            "item_code": int(d.get("Item Code", 0)),
            "element": d.get("Element"),
            "year": int(d.get("Year", 0)),
            "value": float(d["Value"]) if d.get("Value") not in (None, "") else None,
            "unit": d.get("Unit"),
            "flag": d.get("Flag"),
            "flag_meaning": d.get("Flag Description"),
        }
        for d in rows
    ]
    digest = sha256(body)
    url = str(httpx.URL(f"{s.faostat_api}/en/data/QCL", params=params))
    log_fetch("faostat_api", url, digest)
    out["provenance"] = "OFFICIAL_RECORD"
    out["missing"] = [] if out["records"] else [missing("all", "no FAOSTAT rows match this filter")]
    out["source"] = source_ref(out["provider"], url, now_iso(), digest)
    return out


def sync_crop_calendar(
    countries: list[str] | None = None, client: httpx.Client | None = None
) -> dict[str, Any]:
    s = get_settings()
    own = client or httpx.Client(timeout=s.http_timeout_s)
    summary: dict[str, str] = {}
    conn, lock = _db()
    try:
        for iso3 in countries or [c for c in COUNTRIES if c != "WLD"]:
            iso2 = COUNTRIES[iso3]["iso2"]
            url = f"{s.crop_calendar_endpoint}/countries/{iso2}/cropCalendar?language=en"
            try:
                response = own.get(url)
                response.raise_for_status()
                entries = response.json() if response.status_code != 204 else []
                status = "covered" if entries else "not covered by FAO Crop Calendar"
                digest = sha256(response.content)
            except (httpx.HTTPError, ValueError) as exc:
                entries, digest = [], ""
                status = f"fetch failed: {type(exc).__name__}"
            with lock:
                if entries or not status.startswith("fetch failed"):
                    conn.execute("DELETE FROM crop_calendar WHERE iso3 = ?", (iso3,))
                    conn.executemany(
                        "INSERT INTO crop_calendar VALUES (?,?,?,?,?,?,?)",
                        [
                            (
                                iso3,
                                e["crop"]["id"],
                                e["crop"]["name"],
                                e["aez"]["id"],
                                e["aez"]["name"],
                                e.get("lastUpdated"),
                                json.dumps(e.get("sessions", [])),
                            )
                            for e in entries
                        ],
                    )
                    conn.execute(
                        "INSERT OR REPLACE INTO calendar_status VALUES (?,?,?,?,?)",
                        (iso3, status, url, digest, now_iso()),
                    )
                conn.commit()
            if digest:
                log_fetch("crop_calendar", iso3, digest)
            summary[iso3] = status
            time.sleep(REQUEST_GAP_S)
    finally:
        if client is None:
            own.close()
    return summary


def crop_calendar(country: str, crop: str | None = None) -> dict[str, Any]:
    iso3 = resolve_country(country)
    conn, lock = _db()
    with lock:
        status = conn.execute("SELECT * FROM calendar_status WHERE iso3 = ?", (iso3,)).fetchone()
        sql = "SELECT * FROM crop_calendar WHERE iso3 = ?"
        args: list[Any] = [iso3]
        if crop:
            sql += " AND lower(crop) LIKE ?"
            args.append(f"%{crop.lower()}%")
        rows = conn.execute(sql + " ORDER BY crop, aez_id", args).fetchall()
    base: dict[str, Any] = {"provider": CROP_CALENDAR, "country": iso3}
    if status is None:
        return base | {
            "entries": [],
            "missing": [missing("all", "crop calendar not synced yet: run job crop_calendar_sync")],
            "source": None,
        }
    if not rows:
        reason = status["status"] if status["status"] != "covered" else f"no entry for crop {crop}"
        return base | {"entries": [], "missing": [missing("all", reason)], "source": None}
    return base | {
        "provenance": "OFFICIAL_RECORD",
        "entries": [
            {
                "crop": r["crop"],
                "crop_id": r["crop_id"],
                "aez": r["aez"],
                "aez_id": r["aez_id"],
                "last_updated": r["last_updated"],
                "sessions": json.loads(r["sessions"]),
            }
            for r in rows
        ],
        "missing": [],
        "source": source_ref(
            CROP_CALENDAR, status["url"], status["retrieved_at"], status["sha256"]
        ),
    }
