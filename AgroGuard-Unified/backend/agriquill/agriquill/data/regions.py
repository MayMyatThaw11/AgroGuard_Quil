from __future__ import annotations

import json
import os
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from statistics import mean
from typing import Any

from .. import twin
from ..store import missing, now_iso
from . import chirps, fao_pack, gleam, nasapower

SNAPSHOT = Path(__file__).with_name("regions_snapshot.json")
SCHEMA_VERSION = "1.0"
ISO3 = {
    "Myanmar": "MMR",
    "Thailand": "THA",
    "Vietnam": "VNM",
    "Cambodia": "KHM",
    "Laos": "LAO",
    "Indonesia": "IDN",
    "Philippines": "PHL",
    "Malaysia": "MYS",
    "Brunei": "BRN",
    "Singapore": "SGP",
    "Timor-Leste": "TLS",
}
TOWN_WORKERS = 3
BLOCKS = ("rainfall", "weather", "evaporation", "faostat", "crop_calendar")
POWER_LAG_DAYS = 5
POWER_WINDOW_DAYS = 30
ET0_DAYS = 7
FAO_YEARS = 5
CROP = "Rice"
NOTE = (
    "Precomputed from live sources for the region of the demo farms. Region values describe the "
    "town coordinates, not a specific paddy. Each block carries its own source and hash."
)
DEMO_ONLY = "not available for this farm: demo region table only"


def regions() -> list[dict[str, Any]]:
    farms = twin.fixture(twin.MAX_FARMS)["farms"]
    counts: dict[str, int] = {}
    for farm in farms:
        counts[farm["town"]] = counts.get(farm["town"], 0) + 1
    seen: dict[str, dict[str, Any]] = {}
    for country, town, lat, lon, *_ in twin.TOWNS:
        seen.setdefault(
            town,
            {
                "town": town,
                "country": country,
                "iso3": ISO3[country],
                "latitude": lat,
                "longitude": lon,
                "farm_count": counts.get(town, 0),
            },
        )
    return list(seen.values())


def _summary(days: list[dict[str, Any]]) -> dict[str, Any]:
    def values(name: str) -> list[float]:
        return [d[name] for d in days if d.get(name) is not None]

    out: dict[str, Any] = {"days_with_data": len(days), "from": None, "to": None}
    if days:
        out["from"], out["to"] = days[0]["date"], days[-1]["date"]
    for key, name, fn in (
        ("tmax_mean_c", "T2M_MAX", mean),
        ("tmin_mean_c", "T2M_MIN", mean),
        ("rh_mean_pct", "RH2M", mean),
        ("wind_2m_mean_ms", "WS2M", mean),
        ("solar_mean_mj_m2_day", "ALLSKY_SFC_SW_DWN", mean),
        ("rain_total_mm", "PRECTOTCORR", sum),
    ):
        found = values(name)
        out[key] = round(fn(found), 2) if found else None
    return out


def _weather(lat: float, lon: float, today: date) -> dict[str, Any]:
    end = today - timedelta(days=POWER_LAG_DAYS)
    start = end - timedelta(days=POWER_WINDOW_DAYS - 1)
    window = nasapower.daily(lat, lon, start, end)
    complete = [
        d
        for d in window.get("days", [])
        if all(
            d.get(k) is not None
            for k in ("T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN")
        )
    ]
    et0_days = []
    for offset in range(ET0_DAYS):
        day = end - timedelta(days=offset)
        result = nasapower.et0(lat, lon, day)
        et0_days.append(
            {
                "date": day.isoformat(),
                "et0_mm_day": result["et0_mm_day"],
                "missing": result["missing"],
            }
        )
    et0_values = [d["et0_mm_day"] for d in et0_days if d["et0_mm_day"] is not None]
    return {
        "provider": nasapower.PROVIDER,
        "window": {"start": start.isoformat(), "end": end.isoformat()},
        "elevation_m": window.get("elevation_m"),
        "summary": _summary(complete),
        "et0": {
            "provenance": "DERIVED",
            "method": "FAO-56 Penman-Monteith from NASA POWER daily inputs",
            "days": sorted(et0_days, key=lambda d: d["date"]),
            "mean_mm_day": round(mean(et0_values), 2) if et0_values else None,
        },
        "missing": window.get("missing", [])[:20],
        "source": window.get("source"),
    }


def _faostat(iso3: str, year_to: int) -> dict[str, Any]:
    result = fao_pack.faostat_qcl(iso3, CROP, None, year_to - FAO_YEARS, year_to)
    return {
        "crop": CROP,
        "records": result.get("records", []),
        "missing": result.get("missing", []),
        "source": result.get("source"),
    }


def _calendar(iso3: str) -> dict[str, Any]:
    result = fao_pack.crop_calendar(iso3, CROP)
    return {
        "entries": result.get("entries", []),
        "missing": result.get("missing", []),
        "source": result.get("source"),
    }


def build_region(region: dict[str, Any], today: date | None = None) -> dict[str, Any]:
    today = today or datetime.now(UTC).date()
    lat, lon = region["latitude"], region["longitude"]
    entry: dict[str, Any] = dict(region)
    gaps: list[dict[str, str]] = []
    for name, call in (
        ("rainfall", lambda: chirps.assessment(lat, lon)),
        ("weather", lambda: _weather(lat, lon, today)),
        ("evaporation", lambda: gleam.stress(lat, lon)),
        ("faostat", lambda: _faostat(region["iso3"], today.year - 2)),
        ("crop_calendar", lambda: _calendar(region["iso3"])),
    ):
        try:
            entry[name] = call()
        except Exception as exc:
            entry[name] = None
            gaps.append(missing(name, f"{type(exc).__name__}: {exc}"[:160]))
    entry["missing"] = gaps
    entry["built_at"] = now_iso()
    return entry


def build(towns: list[str] | None = None) -> dict[str, Any]:
    listed = regions()
    if towns:
        listed = [r for r in listed if r["town"] in towns]
    today = datetime.now(UTC).date()
    built: dict[str, dict[str, Any]] = {}
    lock = threading.Lock()

    def one(region: dict[str, Any]) -> None:
        entry = build_region(region, today)
        with lock:
            built[region["town"]] = entry
            _write(
                {
                    "schema_version": SCHEMA_VERSION,
                    "built_at": now_iso(),
                    "note": NOTE,
                    "regions": _read().get("regions", {}) | {region["town"]: entry},
                }
            )

    with ThreadPoolExecutor(max_workers=TOWN_WORKERS) as pool:
        list(pool.map(one, listed))
    return {
        "regions": len(_read().get("regions", {})),
        "rebuilt": len(built),
        "incomplete": sorted(t for t, r in built.items() if r["missing"] or _blank(r)),
    }


def _blank(entry: dict[str, Any]) -> bool:
    rain = entry.get("rainfall") or {}
    weather = entry.get("weather") or {}
    return not rain.get("series") or not weather.get("summary", {}).get("days_with_data")


def _write(payload: dict[str, Any]) -> None:
    fd, tmp = tempfile.mkstemp(dir=SNAPSHOT.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=1, sort_keys=True)
        handle.write("\n")
    os.replace(tmp, SNAPSHOT)


def _read() -> dict[str, Any]:
    if not SNAPSHOT.is_file():
        return {}
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


def get(town: str) -> dict[str, Any]:
    data = _read()
    found = data.get("regions", {}).get(town)
    if found is None:
        lowered = town.lower()
        found = next(
            (v for k, v in data.get("regions", {}).items() if lowered in k.lower()),
            None,
        )
    if found is None:
        demo = any(lowered in r["town"].lower() for r in regions())
        reason = (
            "no snapshot for this town yet: run job regions_snapshot"
            if demo
            else f"{DEMO_ONLY}: {town!r} is not a demo town; call farm_location and the "
            "latitude/longitude tools instead"
        )
        return {"town": town, "provenance": "RETRIEVED", "missing": [missing("region", reason)]}
    age = (datetime.now(UTC) - datetime.fromisoformat(found["built_at"])).days
    live = next((r["farm_count"] for r in regions() if r["town"] == found["town"]), 0)
    return found | {
        "farm_count": live,
        "provenance": "RETRIEVED",
        "snapshot_age_days": age,
        "note": NOTE,
    }


def listing() -> dict[str, Any]:
    data = _read()
    built = data.get("regions", {})
    return {
        "built_at": data.get("built_at"),
        "note": NOTE,
        "regions": [
            {
                **r,
                "has_snapshot": r["town"] in built,
                "built_at": built.get(r["town"], {}).get("built_at"),
            }
            for r in regions()
        ],
        "missing": []
        if built
        else [missing("snapshot", "not built yet: run job regions_snapshot")],
    }


SPI_CLASSES = (
    (2.0, "extremely wet"),
    (1.5, "very wet"),
    (1.0, "moderately wet"),
    (-0.99, "near normal"),
    (-1.49, "moderately dry"),
    (-1.99, "severely dry"),
)


def spi_class(spi: float | None) -> str | None:
    if spi is None:
        return None
    return next((label for floor, label in SPI_CLASSES if spi >= floor), "extremely dry")


MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def _window(start: Any, end: Any) -> str | None:
    def day(value: Any) -> str | None:
        if not isinstance(value, dict):
            return None
        try:
            return f"{int(value['day'])} {MONTHS[int(value['month']) - 1]}"
        except (KeyError, ValueError, IndexError):
            return None

    first, last = day(start), day(end)
    return f"{first} to {last}" if first and last else first or last


def facts(entry: dict[str, Any]) -> dict[str, Any]:
    rain = entry.get("rainfall") or {}
    stats = rain.get("statistics") or {}
    weather = entry.get("weather") or {}
    summary = weather.get("summary") or {}
    gleam_block = entry.get("evaporation") or {}
    annual = gleam_block.get("annual") or {}
    records = (entry.get("faostat") or {}).get("records") or []
    yields = [r for r in records if r["element"] == "Yield" and r["value"] is not None]
    latest = max(yields, key=lambda r: r["year"]) if yields else None
    sessions = [
        s
        for e in (entry.get("crop_calendar") or {}).get("entries", [])
        for s in e.get("sessions", [])
    ]
    variety = next((t[5] for t in twin.TOWNS if t[1] == entry["town"]), None)

    def sha(block: dict[str, Any] | None) -> str | None:
        source = (block or {}).get("source") or {}
        return source.get("sha256")

    spi = stats.get("spi3")
    return {
        "town": entry["town"],
        "country": entry["country"],
        "iso3": entry["iso3"],
        "lat": entry["latitude"],
        "lon": entry["longitude"],
        "variety": variety,
        "spi1": stats.get("spi1"),
        "spi3": spi,
        "spi6": stats.get("spi6"),
        "spiClass": spi_class(spi),
        "harvestRain": stats.get("harvest_rain"),
        "rainPercentile": stats.get("latest_percentile"),
        "rainPeriod": stats.get("latest_period"),
        "rain12": [{"period": r["period"], "mm": r["precip_mm"]} for r in rain.get("series", [])],
        "tmaxC": summary.get("tmax_mean_c"),
        "tminC": summary.get("tmin_mean_c"),
        "rain30Mm": summary.get("rain_total_mm"),
        "et0MmDay": (weather.get("et0") or {}).get("mean_mm_day"),
        "elevationM": weather.get("elevation_m"),
        "evaporation": {
            "year": gleam_block.get("year"),
            "actualMm": annual.get("E_mm"),
            "potentialMm": annual.get("Ep_mm"),
            "ratio": annual.get("E_over_Ep"),
            "rootZoneMoisture": annual.get("SMrz_mean"),
        }
        if annual
        else None,
        "riceYieldTHa": round(latest["value"] / 1000, 2)
        if latest and latest["unit"] == "kg/ha"
        else None,
        "riceYieldYear": latest["year"] if latest else None,
        "calendar": [
            {
                "season": s.get("additional_information") or s.get("comments"),
                "sowing": _window(s.get("early_sowing"), s.get("later_sowing")),
                "harvest": _window(s.get("early_harvest"), s.get("late_harvest")),
            }
            for s in sessions[:4]
        ],
        "sources": {
            "chirps": sha(rain),
            "nasaPower": sha(weather),
            "gleam": sha(gleam_block),
            "faostat": sha(entry.get("faostat")),
            "cropCalendar": sha(entry.get("crop_calendar")),
        },
        "builtAt": entry.get("built_at"),
    }


def region_facts() -> list[dict[str, Any]]:
    return [facts(entry) for _, entry in sorted(_read().get("regions", {}).items())]


def to_typescript() -> str:
    rows = region_facts()
    body = json.dumps(rows, ensure_ascii=False, indent=1)
    return (
        "export interface RegionFact {\n"
        "  town: string;\n  country: string;\n  iso3: string;\n  lat: number;\n  lon: number;\n"
        "  variety: string | null;\n  spi1: number | null;\n  spi3: number | null;\n"
        "  spi6: number | null;\n  spiClass: string | null;\n"
        "  harvestRain: { baseline: string; threshold_mm: number; threshold_status: string;"
        " months: { month: number; years: number; median_mm: number; p90_mm: number;"
        " chance_at_or_above: number }[]; reason?: string } | null;\n"
        "  rainPercentile: number | null;\n  rainPeriod: string | null;\n"
        "  rain12: { period: string; mm: number }[];\n  tmaxC: number | null;\n"
        "  tminC: number | null;\n  rain30Mm: number | null;\n  et0MmDay: number | null;\n"
        "  elevationM: number | null;\n"
        "  evaporation: { year: number | null; actualMm: number | null; potentialMm: number | null;"
        " ratio: number | null; rootZoneMoisture: number | null } | null;\n"
        "  riceYieldTHa: number | null;\n  riceYieldYear: number | null;\n"
        "  calendar: { season: string | null; sowing: string | null; harvest: string | null }[];\n"
        "  sources: Record<string, string | null>;\n  builtAt: string | null;\n}\n\n"
        f"export const REGION_FACTS: readonly RegionFact[] = {body};\n"
    )


def for_farm(farm_id: str) -> dict[str, Any]:
    farms = twin.fixture(twin.MAX_FARMS)["farms"]
    farm = next((f for f in farms if f["id"] == farm_id), None)
    if farm is None:
        reason = (
            f"{DEMO_ONLY}: {farm_id!r} is not a demo farm; call farm_location and the "
            "latitude/longitude tools instead"
        )
        return {"farm_id": farm_id, "missing": [missing("farm", reason)]}
    return get(farm["town"]) | {"farm_id": farm_id}
