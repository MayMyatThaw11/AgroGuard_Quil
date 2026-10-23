from __future__ import annotations

import math
import re
import struct
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
import numpy as np

from ..cache import TTLCache
from ..config import get_settings
from ..store import RecordCache, log_fetch, missing, sha256, source_ref

PROVIDER = "CHIRPS v2.0 (UCSB Climate Hazards Center)"
HEADER_BYTES = 16384
WORKERS = 6
MAX_DAILY_DAYS = 92
BASELINE = (1991, 2020)
SPI_SCALES = (1, 3, 6)
HARVEST_MONTHS = (11, 12, 1)
HARVEST_RAIN_MM = 25.0
SPI_SOURCE = "McKee, Doesken and Kleist (1993); WMO-No. 1090 SPI User Guide (2012)"
_CACHE = RecordCache()
_HOT = TTLCache("chirps_hot")
LISTING_TTL_S = 3600.0
_TYPES = {3: ("H", 2), 4: ("I", 4), 12: ("d", 8), 16: ("Q", 8), 2: ("s", 1)}
_TAGS = {
    256: "width",
    257: "height",
    258: "bits",
    259: "compression",
    317: "predictor",
    322: "tile_w",
    323: "tile_h",
    324: "tile_offsets",
    325: "tile_bytes",
    339: "sample_format",
    33550: "pixel_scale",
    33922: "tiepoint",
    42113: "nodata",
}


class ChirpsError(Exception):
    pass


def lzw_decode(data: bytes) -> bytes:
    out = bytearray()
    table: list[bytes] = [bytes([i]) for i in range(256)] + [b"", b""]
    width = 9
    pos = 0
    total = len(data) * 8
    prev: bytes | None = None
    padded = data + b"\x00\x00\x00"
    while pos + width <= total:
        chunk = int.from_bytes(padded[pos >> 3 : (pos >> 3) + 3], "big")
        code = (chunk >> (24 - (pos & 7) - width)) & ((1 << width) - 1)
        pos += width
        if code == 256:
            del table[258:]
            width = 9
            prev = None
            continue
        if code == 257:
            break
        if prev is None:
            entry = table[code]
        elif code < len(table):
            entry = table[code]
            table.append(prev + entry[:1])
        elif code == len(table):
            entry = prev + prev[:1]
            table.append(entry)
        else:
            raise ChirpsError(f"corrupt LZW stream: code {code} beyond table")
        out += entry
        prev = entry
        if len(table) + 1 >= (1 << width) and width < 12:
            width += 1
    return bytes(out)


def parse_header(head: bytes, fetch_more: Any = None, checks: bool = True) -> dict[str, Any]:
    if head[:2] == b"II":
        bo = "<"
    elif head[:2] == b"MM":
        bo = ">"
    else:
        raise ChirpsError("not a TIFF file")
    big = struct.unpack(bo + "H", head[2:4])[0] == 43
    if big:
        ifd = struct.unpack(bo + "Q", head[8:16])[0]
        count = struct.unpack(bo + "Q", head[ifd : ifd + 8])[0]
        first, size, cnt_fmt, val_len = ifd + 8, 20, "Q", 8
    else:
        ifd = struct.unpack(bo + "I", head[4:8])[0]
        count = struct.unpack(bo + "H", head[ifd : ifd + 2])[0]
        first, size, cnt_fmt, val_len = ifd + 2, 12, "I", 4
    tags: dict[str, Any] = {}
    for i in range(count):
        entry = head[first + i * size : first + (i + 1) * size]
        tag, typ = struct.unpack(bo + "HH", entry[:4])
        name = _TAGS.get(tag)
        if name is None or typ not in _TYPES:
            continue
        n = struct.unpack(bo + cnt_fmt, entry[4 : 4 + val_len])[0]
        fmt, width = _TYPES[typ]
        raw_value = entry[4 + val_len :]
        nbytes = n * width
        if nbytes <= val_len:
            blob = raw_value[:nbytes]
        else:
            offset = struct.unpack(bo + cnt_fmt, raw_value)[0]
            if offset + nbytes > len(head):
                if fetch_more is None:
                    raise ChirpsError(f"tag {name} lies outside the header read")
                blob = fetch_more(offset, nbytes)
            else:
                blob = head[offset : offset + nbytes]
        if typ == 2:
            tags[name] = blob.rstrip(b"\x00").decode("ascii", "replace")
        else:
            values = struct.unpack(f"{bo}{n}{fmt}", blob)
            tags[name] = values[0] if n == 1 else list(values)
    for need in ("width", "height", "tile_w", "tile_h", "tile_offsets", "tile_bytes"):
        if need not in tags:
            raise ChirpsError(f"missing TIFF tag {need}")
    tags["byte_order"] = bo
    if not checks:
        return tags
    if tags.get("compression") not in (1, 5):
        raise ChirpsError(f"unsupported compression {tags.get('compression')}")
    if tags.get("predictor", 1) != 1:
        raise ChirpsError("unsupported predictor")
    if tags.get("sample_format") != 3:
        raise ChirpsError("expected float samples")
    return tags


def pixel_of(tags: dict[str, Any], lat: float, lon: float) -> tuple[int, int]:
    sx, sy = tags["pixel_scale"][0], tags["pixel_scale"][1]
    x0, y0 = tags["tiepoint"][3], tags["tiepoint"][4]
    col = math.floor((lon - x0) / sx)
    row = math.floor((y0 - lat) / sy)
    if not (0 <= col < tags["width"] and 0 <= row < tags["height"]):
        raise ChirpsError("point is outside CHIRPS coverage (50S to 50N)")
    return row, col


def value_from_tile(tags: dict[str, Any], tile: bytes, row: int, col: int) -> float | None:
    data = lzw_decode(tile) if tags.get("compression") == 5 else tile
    index = (row % tags["tile_h"]) * tags["tile_w"] + (col % tags["tile_w"])
    if (index + 1) * 4 > len(data):
        raise ChirpsError("tile is shorter than expected")
    value = struct.unpack(tags["byte_order"] + "f", data[index * 4 : index * 4 + 4])[0]
    nodata = tags.get("nodata")
    if math.isnan(value) or value < 0 or (nodata is not None and value == float(nodata)):
        return None
    return round(float(value), 2)


def _range(client: httpx.Client, url: str, start: int, length: int) -> bytes:
    response = client.get(url, headers={"Range": f"bytes={start}-{start + length - 1}"})
    response.raise_for_status()
    if response.status_code != 206 and start > 0:
        raise ChirpsError("server ignored the byte range")
    return response.content[:length]


def read_point(client: httpx.Client, url: str, lat: float, lon: float) -> tuple[float | None, str]:
    tags = _HOT.get(("tags", url))
    if tags is None:
        head = _range(client, url, 0, HEADER_BYTES)
        tags = parse_header(head, lambda off, n: _range(client, url, off, n))
        _HOT.set(("tags", url), tags, LISTING_TTL_S)
    row, col = pixel_of(tags, lat, lon)
    across = math.ceil(tags["width"] / tags["tile_w"])
    tile_index = (row // tags["tile_h"]) * across + col // tags["tile_w"]
    offset = tags["tile_offsets"][tile_index]
    nbytes = tags["tile_bytes"][tile_index]
    tile = _range(client, url, offset, nbytes)
    if len(tile) != nbytes:
        raise ChirpsError("truncated tile")
    return value_from_tile(tags, tile, row, col), sha256(tile)


_CLIENT: list[httpx.Client] = []


def _shared() -> httpx.Client:
    if not _CLIENT:
        _CLIENT.append(httpx.Client(timeout=get_settings().http_timeout_s, follow_redirects=True))
    return _CLIENT[0]


def monthly_url(year: int, month: int) -> str:
    return f"{get_settings().chirps_base}/global_monthly/cogs/chirps-v2.0.{year}.{month:02d}.cog"


def daily_url(day: date) -> str:
    base = get_settings().chirps_base
    return f"{base}/global_daily/cogs/p05/{day.year}/chirps-v2.0.{day:%Y.%m.%d}.cog"


def latest_month(client: httpx.Client) -> tuple[int, int]:
    hit = _HOT.get("latest_month")
    if hit is not None:
        return hit
    response = client.get(f"{get_settings().chirps_base}/global_monthly/cogs/")
    response.raise_for_status()
    found = re.findall(r"chirps-v2\.0\.(\d{4})\.(\d{2})\.cog", response.text)
    if not found:
        raise ChirpsError("no monthly files listed")
    latest = max((int(y), int(m)) for y, m in found)
    _HOT.set("latest_month", latest, LISTING_TTL_S)
    return latest


def _months(start: date, end: date) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        out.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def rainfall(
    lat: float,
    lon: float,
    start: date,
    end: date,
    step: str = "monthly",
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    if end < start:
        raise ValueError("end is before start")
    if step not in ("monthly", "daily"):
        raise ValueError("step must be monthly or daily")
    if step == "daily" and (end - start).days >= MAX_DAILY_DAYS:
        raise ValueError(f"daily requests are limited to {MAX_DAILY_DAYS} days")
    own = client or _shared()
    series: list[dict[str, Any]] = []
    gaps: list[dict[str, str]] = []
    digests: list[str] = []
    if step == "monthly":
        try:
            last = latest_month(own)
        except (httpx.HTTPError, ChirpsError) as exc:
            last = (end.year, end.month)
            gaps.append(missing("listing", f"could not read the file index: {type(exc).__name__}"))
        stamps = [
            (f"{y}-{m:02d}", monthly_url(y, m)) for y, m in _months(start, end) if (y, m) <= last
        ]
        if (end.year, end.month) > last:
            gaps.append(missing("after", f"CHIRPS monthly ends at {last[0]}-{last[1]:02d}"))
    else:
        stamps = [
            (f"{d:%Y-%m-%d}", daily_url(d))
            for d in (start + timedelta(days=i) for i in range((end - start).days + 1))
        ]
    probe = parse_cell(own, stamps[0][1], lat, lon) if stamps else None
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(
            pool.map(lambda su: _cached_value(own, su[1], su[0], lat, lon, probe), stamps)
        )
    for (stamp, _), (value, digest, reason) in zip(stamps, results, strict=True):
        series.append({"period": stamp, "precip_mm": value})
        if digest:
            digests.append(digest)
        if reason:
            gaps.append(missing(stamp, reason))
    combined = sha256("|".join(digests).encode()) if digests else None
    out: dict[str, Any] = {
        "provider": PROVIDER,
        "provenance": "RETRIEVED",
        "step": step,
        "location": {"latitude": round(lat, 4), "longitude": round(lon, 4)},
        "cell": probe,
        "unit": "mm/month" if step == "monthly" else "mm/day",
        "series": series,
        "missing": gaps,
        "source": None
        if combined is None
        else source_ref(
            PROVIDER,
            f"{get_settings().chirps_base}/global_{step}/cogs/",
            datetime.now(UTC).isoformat(timespec="seconds"),
            combined,
        ),
    }
    if step == "monthly":
        out["statistics"] = statistics(series)
    return out


def assessment(
    lat: float, lon: float, recent_months: int = 12, client: httpx.Client | None = None
) -> dict[str, Any]:
    own = client or _shared()
    last = latest_month(own)
    wanted = {_shift(last[0], last[1], -k) for k in range(recent_months)}
    for year in range(BASELINE[0], BASELINE[1] + 2):
        wanted.update(_shift(year, last[1], -k) for k in range(3))
    stamps = sorted(s for s in wanted if (int(s[:4]), int(s[5:7])) <= last)
    urls = {s: monthly_url(int(s[:4]), int(s[5:7])) for s in stamps}
    probe = parse_cell(own, urls[stamps[-1]], lat, lon)
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(lambda s: _cached_value(own, urls[s], s, lat, lon, probe), stamps))
    series = [{"period": s, "precip_mm": r[0]} for s, r in zip(stamps, results, strict=True)]
    gaps = [missing(s, r[2]) for s, r in zip(stamps, results, strict=True) if r[2]]
    digests = [r[1] for r in results if r[1]]
    recent = {_shift(last[0], last[1], -k) for k in range(recent_months)}
    return {
        "provider": PROVIDER,
        "provenance": "RETRIEVED",
        "location": {"latitude": round(lat, 4), "longitude": round(lon, 4)},
        "cell": probe,
        "unit": "mm/month",
        "series": [s for s in series if s["period"] in recent],
        "statistics": statistics(series),
        "missing": gaps,
        "source": source_ref(
            PROVIDER,
            f"{get_settings().chirps_base}/global_monthly/cogs/",
            datetime.now(UTC).isoformat(timespec="seconds"),
            sha256("|".join(digests).encode()),
        )
        if digests
        else None,
    }


def parse_cell(client: httpx.Client, url: str, lat: float, lon: float) -> dict[str, Any] | None:
    key = ("cell", "daily" in url, round(lat, 4), round(lon, 4))
    hit = _HOT.get(key)
    if hit is not None:
        return hit
    try:
        head = _range(client, url, 0, HEADER_BYTES)
        tags = parse_header(head, lambda off, n: _range(client, url, off, n))
        row, col = pixel_of(tags, lat, lon)
        cell = {"row": row, "col": col, "resolution_deg": round(tags["pixel_scale"][0], 4)}
        _HOT.set(key, cell, LISTING_TTL_S)
        return cell
    except (httpx.HTTPError, ChirpsError):
        return None


def _cached_value(
    client: httpx.Client,
    url: str,
    stamp: str,
    lat: float,
    lon: float,
    cell: dict[str, Any] | None,
) -> tuple[float | None, str | None, str | None]:
    key = (
        f"{cell['row']}:{cell['col']}:{stamp}"
        if cell
        else f"{round(lat, 4)}:{round(lon, 4)}:{stamp}"
    )
    hit = _CACHE.get("chirps", key)
    if hit is not None:
        return hit["payload"]["precip_mm"], hit["sha256"], hit["payload"].get("reason")
    try:
        value, digest = read_point(client, url, lat, lon)
    except httpx.HTTPStatusError as exc:
        return None, None, f"HTTP {exc.response.status_code}"
    except (httpx.HTTPError, ChirpsError) as exc:
        return None, None, f"{type(exc).__name__}: {exc}"[:160]
    reason = None if value is not None else "no data at this cell (sea or nodata)"
    _CACHE.put("chirps", key, {"precip_mm": value, "reason": reason}, url, digest, None)
    log_fetch("chirps", key, digest)
    return value, digest, reason


def statistics(series: list[dict[str, Any]]) -> dict[str, Any]:
    by_month: dict[int, list[tuple[int, float]]] = {}
    for item in series:
        if item["precip_mm"] is None:
            continue
        year, month = int(item["period"][:4]), int(item["period"][5:7])
        by_month.setdefault(month, []).append((year, item["precip_mm"]))
    base_years = set(range(BASELINE[0], BASELINE[1] + 1))
    latest = next((s for s in reversed(series) if s["precip_mm"] is not None), None)
    out: dict[str, Any] = {
        "baseline": f"{BASELINE[0]}-{BASELINE[1]}",
        "latest_period": latest["period"] if latest else None,
        "latest_percentile": None,
        "spi1": None,
        "spi3": None,
        "spi6": None,
        "harvest_rain": None,
        "spi_source": SPI_SOURCE,
    }
    if latest is None:
        out["reason"] = "no rainfall values"
        return out
    month = int(latest["period"][5:7])
    base = [v for y, v in by_month.get(month, []) if y in base_years]
    if len(base) < 25:
        out["reason"] = f"baseline has {len(base)} of 30 years for this month; need at least 25"
        return out
    out["latest_percentile"] = round(
        100.0 * sum(v <= latest["precip_mm"] for v in base) / len(base), 1
    )
    for scale in SPI_SCALES:
        out[f"spi{scale}"] = spi(series, month, scale)
    out["harvest_rain"] = harvest_rain(series)
    return out


def spi3(series: list[dict[str, Any]], month: int) -> float | None:
    return spi(series, month, 3)


def harvest_rain(series: list[dict[str, Any]]) -> dict[str, Any]:
    """Baseline odds of a wet harvest month; the damaging total is a named TO VERIFY threshold."""
    base_years = range(BASELINE[0], BASELINE[1] + 1)
    values = {s["period"]: s["precip_mm"] for s in series}
    out: dict[str, Any] = {
        "baseline": f"{BASELINE[0]}-{BASELINE[1]}",
        "threshold_mm": HARVEST_RAIN_MM,
        "threshold_status": "TO VERIFY with DAR Yezin: monthly total treated as harvest-damaging",
        "months": [],
    }
    for month in HARVEST_MONTHS:
        totals = [v for y in base_years if (v := values.get(f"{y}-{month:02d}")) is not None]
        if len(totals) < 25:
            out["months"] = []
            out["reason"] = f"baseline has {len(totals)} of 30 years for month {month}; need 25"
            return out
        arr = np.asarray(totals)
        out["months"].append(
            {
                "month": month,
                "years": len(totals),
                "median_mm": round(float(np.median(arr)), 1),
                "p90_mm": round(float(np.percentile(arr, 90)), 1),
                "chance_at_or_above": round(float(np.mean(arr >= HARVEST_RAIN_MM)), 3),
            }
        )
    return out


def spi(series: list[dict[str, Any]], month: int, scale: int) -> float | None:
    """SPI over `scale` months ending at `month` (McKee 1993; WMO-No. 1090 gamma-mixed method)."""
    from scipy import stats

    values = {s["period"]: s["precip_mm"] for s in series}
    totals: dict[int, float] = {}
    for year in range(BASELINE[0], BASELINE[1] + 2):
        keys = [_shift(year, month, -k) for k in range(scale)]
        parts = [values.get(k) for k in keys]
        if all(p is not None for p in parts):
            totals[year] = float(sum(p for p in parts if p is not None))
    latest_year = max((int(p[:4]) for p in values if int(p[5:7]) == month), default=None)
    if latest_year is None:
        return None
    keys = [_shift(latest_year, month, -k) for k in range(scale)]
    parts = [values.get(k) for k in keys]
    if any(p is None for p in parts):
        return None
    current = float(sum(p for p in parts if p is not None))
    base = np.array([v for y, v in totals.items() if BASELINE[0] <= y <= BASELINE[1]])
    if len(base) < 25:
        return None
    zeros = float(np.mean(base == 0))
    positive = base[base > 0]
    if len(positive) < 10:
        return None
    shape, _, scale = stats.gamma.fit(positive, floc=0)
    cdf = zeros + (1 - zeros) * (stats.gamma.cdf(current, shape, scale=scale) if current > 0 else 0)
    cdf = min(max(cdf, 1e-6), 1 - 1e-6)
    return round(float(stats.norm.ppf(cdf)), 2)


def _shift(year: int, month: int, delta: int) -> str:
    index = year * 12 + (month - 1) + delta
    return f"{index // 12}-{index % 12 + 1:02d}"
