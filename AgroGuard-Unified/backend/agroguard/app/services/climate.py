"""Approximate growing conditions for any point on Earth.

- Temperature, annual rainfall and humidity: NASA POWER climatology (the
  long-term mean at the point's grid cell; free, no key).
- Soil pH: ISRIC SoilGrids (NASA POWER has no soil data). SoilGrids has gaps
  (cities, water, ice) and is rate limited, so a missing value is retried at
  nearby points, results are cached, and calls are spaced out.

Both are coarse: a ~50 km weather cell and a 250 m soil map. They suit a
first suggestion for a field, not a replacement for a soil test.
"""

import asyncio
import logging
import time
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

NASA_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point"
SOILGRIDS_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query"
NASA_FILL = -999.0  # NASA POWER marks missing values with -999
DAYS_PER_YEAR = 365.25

# Nearby points to try when SoilGrids has no value at the clicked point.
SOIL_OFFSETS_DEG = ((0.0, 0.0), (0.03, 0.0), (0.0, 0.03), (-0.03, -0.03))
SOIL_CELL_DEG = 0.05  # cache key resolution (~5 km)
SOIL_MIN_GAP_S = 1.0  # SoilGrids allows only a few calls a minute
SOIL_TIMEOUT_S = 8.0
NASA_TIMEOUT_S = 25.0
CACHE_TTL_S = 24 * 3600


class ClimateUnavailableError(RuntimeError):
    """NASA POWER could not provide climate data for the point."""


@dataclass(frozen=True)
class Climate:
    temperature_c: float
    rainfall_annual_mm: float
    humidity_pct: int


@dataclass(frozen=True)
class SoilPh:
    value: float
    depth_cm: str = "0-30"


_cache: dict[tuple, tuple[float, object]] = {}
_soil_lock = asyncio.Lock()
_last_soil_call = 0.0


def _cached(key: tuple):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_TTL_S:
        return hit[1]
    return None


def _store(key: tuple, value: object) -> None:
    _cache[key] = (time.monotonic(), value)


def _client(timeout: float) -> httpx.AsyncClient:
    # A function so tests can swap in a mock transport.
    return httpx.AsyncClient(timeout=timeout)


async def fetch_climate(lat: float, lon: float) -> Climate:
    """Long-term mean temperature, annual rainfall and humidity from NASA POWER."""
    key = ("nasa", round(lat * 4) / 4, round(lon * 4) / 4)  # NASA's grid is coarser than 0.25 deg
    if (hit := _cached(key)) is not None:
        return hit
    params = {
        "parameters": "T2M,PRECTOTCORR,RH2M",
        "community": "AG",
        "latitude": f"{lat:.4f}",
        "longitude": f"{lon:.4f}",
        "format": "JSON",
    }
    try:
        async with _client(NASA_TIMEOUT_S) as client:
            response = await client.get(NASA_URL, params=params)
        response.raise_for_status()
        values = response.json()["properties"]["parameter"]
        temperature = float(values["T2M"]["ANN"])
        rain_per_day = float(values["PRECTOTCORR"]["ANN"])
        humidity = float(values["RH2M"]["ANN"])
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
        logger.warning("NASA POWER request failed for %s,%s: %s", lat, lon, exc)
        raise ClimateUnavailableError("NASA POWER is not reachable right now.") from exc
    if NASA_FILL in (temperature, rain_per_day, humidity):
        raise ClimateUnavailableError("NASA POWER has no data for this location (open ocean?).")
    climate = Climate(
        temperature_c=round(temperature, 1),
        rainfall_annual_mm=round(rain_per_day * DAYS_PER_YEAR),
        humidity_pct=round(humidity),
    )
    _store(key, climate)
    return climate


async def _soilgrids_ph(lat: float, lon: float) -> float | None:
    """Mean topsoil pH (0-30 cm) at one point, or None when SoilGrids has no value there."""
    global _last_soil_call
    params = [
        ("lat", f"{lat:.5f}"),
        ("lon", f"{lon:.5f}"),
        ("property", "phh2o"),
        ("depth", "0-5cm"),
        ("depth", "5-15cm"),
        ("depth", "15-30cm"),
        ("value", "mean"),
    ]
    async with _soil_lock:  # serialise and space calls to stay under the rate limit
        wait = SOIL_MIN_GAP_S - (time.monotonic() - _last_soil_call)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            async with _client(SOIL_TIMEOUT_S) as client:
                response = await client.get(SOILGRIDS_URL, params=params)
            response.raise_for_status()
            layers = response.json()["properties"]["layers"][0]["depths"]
        finally:
            _last_soil_call = time.monotonic()
    means = [d["values"]["mean"] for d in layers if d["values"].get("mean") is not None]
    if not means:
        return None
    return sum(means) / len(means) / 10  # SoilGrids stores pH x 10


async def fetch_soil_ph(lat: float, lon: float) -> SoilPh | None:
    """Topsoil pH near the point, or None when SoilGrids cannot supply one."""
    key = ("soil", round(lat / SOIL_CELL_DEG), round(lon / SOIL_CELL_DEG))
    if key in _cache and (hit := _cached(key)) is not None:
        return hit or None
    for d_lat, d_lon in SOIL_OFFSETS_DEG:
        try:
            ph = await _soilgrids_ph(lat + d_lat, lon + d_lon)
        except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError) as exc:
            logger.warning("SoilGrids request failed near %s,%s: %s", lat, lon, exc)
            return None  # rate limited or down: don't hammer it, and don't cache the miss
        if ph is not None:
            soil = SoilPh(value=round(ph, 1))
            _store(key, soil)
            return soil
    _store(key, False)  # genuinely no soil data here (city, water, ice): remember it
    return None
