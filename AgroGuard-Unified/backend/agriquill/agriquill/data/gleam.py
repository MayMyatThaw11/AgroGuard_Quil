from __future__ import annotations

import io
import re
import threading
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

import h5py
import numpy as np
import paramiko

from ..cache import TTLCache
from ..config import get_settings
from ..resilience import Breaker, CircuitOpen, guarded
from ..store import RecordCache, log_fetch, missing, sha256, source_ref

PROVIDER = "GLEAM v4.3 (Ghent University and Vrije Universiteit Amsterdam)"
CITATION = (
    "Miralles et al. (2025) GLEAM4; Miralles et al. (2011) Hydrology and Earth System Sciences "
    "15, 453-469, doi:10.5194/hess-15-453-2011. Commercial use needs GLEAM approval."
)
ROOT = "data"
GRID = 0.1
LAT0 = 89.95
LON0 = -179.95
ROWS = 1800
COLS = 3600
FILL = -999.0
FLUX = ("E", "Ep", "Ei", "Eb", "Es", "Et", "Ew", "Ec")
UNITS = {
    **{v: "mm/month" for v in FLUX},
    "S": "-",
    "SMrz": "m3/m3",
    "SMs": "m3/m3",
    "H": "W/m2",
}
DAILY_UNITS = {**{v: "mm/day" for v in FLUX}, "S": "-", "SMrz": "m3/m3", "SMs": "m3/m3"}
STRESS_VARIABLES = ("E", "Ep", "Et", "Eb", "S", "SMrz")
MAX_DAILY_DAYS = 92
WORKERS = 3
VARIANT_B = "v4.3b"
VARIANT_A = "v4.3a"
FIRST_B_YEAR = 2003
LISTING_TTL_S = 6 * 3600.0
_CACHE = RecordCache()
_HOT = TTLCache("gleam_hot")
MAX_CONNECTIONS = 3
_SLOTS = threading.BoundedSemaphore(MAX_CONNECTIONS)
_BREAKER = Breaker(threshold=3, cooldown_s=60.0, name="gleam")


class GleamError(Exception):
    pass


@dataclass
class Handle:
    file: h5py.File
    path: str
    size: int


class Remote(io.RawIOBase):
    def __init__(self, handle: paramiko.SFTPFile, size: int) -> None:
        self.handle = handle
        self.size = size
        self.pos = 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = 0) -> int:
        base = {0: 0, 1: self.pos, 2: self.size}[whence]
        self.pos = base + offset
        return self.pos

    def readinto(self, buffer: Any) -> int:
        wanted = min(len(buffer), self.size - self.pos)
        if wanted <= 0:
            return 0
        data = b"".join(self.handle.readv([(self.pos, wanted)]))
        buffer[: len(data)] = data
        self.pos += len(data)
        return len(data)


def configured() -> bool:
    s = get_settings()
    return bool(s.gleam_user and s.gleam_password)


def _transient(exc: Exception) -> bool:
    if isinstance(exc, paramiko.AuthenticationException):
        return False
    return isinstance(exc, (paramiko.SSHException, EOFError, OSError, TimeoutError))


@contextmanager
def _sftp() -> Iterator[paramiko.SFTPClient]:
    s = get_settings()
    if not configured() or s.gleam_password is None:
        raise GleamError("AGRIQUILL_GLEAM_USER and AGRIQUILL_GLEAM_PASSWORD are not set")
    with _SLOTS:
        transport = paramiko.Transport((s.gleam_host, s.gleam_port))
        transport.banner_timeout = 30
        try:
            transport.connect(username=s.gleam_user, password=s.gleam_password.get_secret_value())
            client = paramiko.SFTPClient.from_transport(transport)
            if client is None:
                raise GleamError("SFTP channel could not be opened")
            client.get_channel().settimeout(s.http_timeout_s * 2)
            try:
                yield client
            finally:
                client.close()
        finally:
            transport.close()


@contextmanager
def open_file(path: str) -> Iterator[Handle]:
    with _sftp() as client:
        size = client.stat(path).st_size or 0
        raw = client.open(path, "rb")
        remote = Remote(raw, size)
        h5 = h5py.File(remote, "r")
        try:
            yield Handle(h5, path, size)
        finally:
            h5.close()
            raw.close()


def variant_for(year: int, latest_b: int) -> str:
    if FIRST_B_YEAR <= year <= latest_b:
        return VARIANT_B
    return VARIANT_A


def latest_year() -> int:
    hit = _HOT.get(("latest",))
    if hit is not None:
        return int(hit)

    def listing() -> int:
        with _sftp() as client:
            names = client.listdir(f"{ROOT}/{VARIANT_B}/monthly/Et")
        years = [int(m.group(1)) for n in names if (m := re.search(r"_(\d{4})_", n))]
        if not years:
            raise GleamError("no GLEAM monthly files listed")
        return max(years)

    year = guarded(_BREAKER, listing, is_transient=_transient)
    _HOT.set(("latest",), year, LISTING_TTL_S)
    return year


def cell_of(lat: float, lon: float) -> tuple[int, int]:
    row = round((LAT0 - lat) / GRID)
    col = round((lon - LON0) / GRID)
    if not (0 <= row < ROWS and 0 <= col < COLS):
        raise ValueError("coordinate outside the GLEAM grid")
    return row, col


def centre_of(row: int, col: int) -> dict[str, float]:
    return {"latitude": round(LAT0 - row * GRID, 2), "longitude": round(LON0 + col * GRID, 2)}


def _monthly_path(variant: str, variable: str, year: int) -> str:
    return f"{ROOT}/{variant}/monthly/{variable}/{variable}_{year}_GLEAM_{variant}_MO.nc"


def _daily_path(variant: str, variable: str, year: int) -> str:
    return f"{ROOT}/{variant}/daily/{year}/{variable}_{year}_GLEAM_{variant}.nc"


def _series(h5: h5py.File, variable: str, row: int, col: int, sl: slice) -> np.ndarray:
    data = h5[variable]
    if data.shape[1:] != (ROWS, COLS):
        raise GleamError(f"unexpected grid {data.shape} in {variable}")
    return np.asarray(data[sl, row, col], dtype="float64")


def _clean(values: np.ndarray) -> list[float | None]:
    return [None if (not np.isfinite(v) or v == FILL) else round(float(v), 4) for v in values]


def _read(
    path: str, variable: str, row: int, col: int, sl: slice
) -> tuple[list[float | None], str]:
    def work() -> tuple[list[float | None], str]:
        with open_file(path) as handle:
            values = _series(handle.file, variable, row, col, sl)
        return _clean(values), sha256(f"{path}|{row}|{col}|".encode() + values.tobytes())

    return guarded(_BREAKER, work, is_transient=_transient)


def _fetch(
    path: str, variable: str, row: int, col: int, sl: slice, key: str
) -> tuple[list[float | None] | None, str | None, str | None]:
    hit = _CACHE.get("gleam", key)
    if hit is not None:
        return hit["payload"]["values"], hit["sha256"], None
    try:
        values, digest = _read(path, variable, row, col, sl)
    except CircuitOpen as exc:
        return None, None, str(exc)
    except (GleamError, paramiko.SSHException, OSError, EOFError, KeyError, ValueError) as exc:
        return None, None, f"{variable}: {type(exc).__name__}: {exc}"[:200]
    _CACHE.put("gleam", key, {"values": values}, f"sftp://{path}", digest, None)
    log_fetch("gleam", key, digest)
    return values, digest, None


def _envelope(
    lat: float,
    lon: float,
    row: int,
    col: int,
    variant: str,
    year: int,
    results: dict[str, tuple[list[float | None] | None, str | None, str | None]],
    paths: dict[str, str],
) -> dict[str, Any]:
    digests = [d for _, d, _ in results.values() if d]
    s = get_settings()
    return {
        "provider": PROVIDER,
        "provenance": "RETRIEVED",
        "variant": variant,
        "year": year,
        "location": {"latitude": round(lat, 4), "longitude": round(lon, 4)},
        "cell": {"row": row, "col": col, "centre": centre_of(row, col), "resolution_deg": GRID},
        "citation": CITATION,
        "missing": [missing(v, r[2]) for v, r in results.items() if r[2]],
        "source": source_ref(
            PROVIDER,
            f"sftp://{s.gleam_host}:{s.gleam_port}/{ROOT}/{variant}/",
            datetime.now(UTC).isoformat(timespec="seconds"),
            sha256("|".join(digests).encode()),
        )
        if digests
        else None,
        "files": paths,
    }


def monthly(
    lat: float,
    lon: float,
    year: int | None = None,
    variables: tuple[str, ...] = STRESS_VARIABLES,
) -> dict[str, Any]:
    unknown = [v for v in variables if v not in UNITS]
    if unknown:
        raise ValueError(f"unknown GLEAM variables: {', '.join(unknown)}")
    row, col = cell_of(lat, lon)
    try:
        latest = latest_year()
    except (GleamError, CircuitOpen, paramiko.SSHException, OSError, EOFError) as exc:
        return _unavailable(lat, lon, f"GLEAM listing failed: {type(exc).__name__}: {exc}")
    year = year or latest
    if not 1980 <= year <= latest:
        raise ValueError(f"year must be between 1980 and {latest}")
    variant = variant_for(year, latest)
    paths = {v: _monthly_path(variant, v, year) for v in variables}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {
            v: pool.submit(
                _fetch, paths[v], v, row, col, slice(None), f"{variant}:{v}:MO:{year}:{row}:{col}"
            )
            for v in variables
        }
        results = {v: f.result() for v, f in futures.items()}
    out = _envelope(lat, lon, row, col, variant, year, results, paths)
    months = [f"{year}-{m:02d}" for m in range(1, 13)]
    out["periods"] = months
    out["variables"] = {v: {"unit": UNITS[v], "values": results[v][0]} for v in variables}
    out["note"] = (
        "Flux variables in the monthly files are monthly totals (mm/month), although the file "
        "attribute says mm/day; checked against the daily file for Et, January 2025. S is "
        "GLEAM's stress factor as published; it equals E/Ep only in dry months (E includes "
        "interception and open-water terms and can exceed Ep)."
    )
    return out


def _unavailable(lat: float, lon: float, reason: str) -> dict[str, Any]:
    return {
        "provider": PROVIDER,
        "location": {"latitude": round(lat, 4), "longitude": round(lon, 4)},
        "variables": {},
        "missing": [missing("all", reason)],
        "source": None,
    }


def _total(values: list[float | None] | None) -> float | None:
    if values is None or any(v is None for v in values):
        return None
    return round(float(sum(v for v in values if v is not None)), 2)


def stress(lat: float, lon: float, year: int | None = None) -> dict[str, Any]:
    out = monthly(lat, lon, year)
    if not out.get("variables"):
        return out
    series = {k: v["values"] for k, v in out["variables"].items()}
    evaporation, potential = _total(series.get("E")), _total(series.get("Ep"))
    out["annual"] = {
        "provenance": "DERIVED",
        "E_mm": evaporation,
        "Ep_mm": potential,
        "Et_mm": _total(series.get("Et")),
        "Eb_mm": _total(series.get("Eb")),
        "E_over_Ep": (
            round(evaporation / potential, 3) if evaporation is not None and potential else None
        ),
        "S_mean": _mean(series.get("S")),
        "SMrz_mean": _mean(series.get("SMrz")),
    }
    return out


def _mean(values: list[float | None] | None) -> float | None:
    if values is None or any(v is None for v in values):
        return None
    return round(float(np.mean([v for v in values if v is not None])), 3)


def daily(
    lat: float,
    lon: float,
    start: date,
    end: date,
    variables: tuple[str, ...] = ("Et", "S", "SMrz"),
) -> dict[str, Any]:
    if end < start or start.year != end.year:
        raise ValueError("start and end must be in the same year and ordered")
    if (end - start).days >= MAX_DAILY_DAYS:
        raise ValueError(f"at most {MAX_DAILY_DAYS} days per request")
    unknown = [v for v in variables if v not in DAILY_UNITS]
    if unknown:
        raise ValueError(f"unknown GLEAM variables: {', '.join(unknown)}")
    row, col = cell_of(lat, lon)
    try:
        latest = latest_year()
    except (GleamError, CircuitOpen, paramiko.SSHException, OSError, EOFError) as exc:
        return _unavailable(lat, lon, f"GLEAM listing failed: {type(exc).__name__}: {exc}")
    if not 1980 <= start.year <= latest:
        raise ValueError(f"year must be between 1980 and {latest}")
    variant = variant_for(start.year, latest)
    first = (start - date(start.year, 1, 1)).days
    last = (end - date(start.year, 1, 1)).days + 1
    paths = {v: _daily_path(variant, v, start.year) for v in variables}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {
            v: pool.submit(
                _fetch,
                paths[v],
                v,
                row,
                col,
                slice(first, last),
                f"{variant}:{v}:D:{start}:{end}:{row}:{col}",
            )
            for v in variables
        }
        results = {v: f.result() for v, f in futures.items()}
    out = _envelope(lat, lon, row, col, variant, start.year, results, paths)
    out["dates"] = [(start + timedelta(days=i)).isoformat() for i in range(last - first)]
    out["variables"] = {v: {"unit": DAILY_UNITS[v], "values": results[v][0]} for v in variables}
    return out
