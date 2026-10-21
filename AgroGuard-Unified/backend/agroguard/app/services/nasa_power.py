"""NASA POWER daily historical weather (temperature, humidity, precipitation,
solar radiation) for a point, for a bounded date range.

This is a distinct NASA POWER endpoint from app/services/climate.py's
`fetch_climate`, which calls the *climatology* endpoint (one long-term
annual-mean number) and is used by Crop Suggestion / Farm Simulation. This
module calls the *daily* endpoint instead, for Water Management's NASA
weather display. Neither reads nor writes anything in the other.

Units and time convention are taken from a real, live-verified NASA POWER
daily response (see AGROGUARD_NASA_WATER_FEASIBILITY_STATUS.md): solar
radiation is MJ/m^2/day (not kWh/m^2/day), and the daily time basis is
Local Solar Time, not UTC.

These values are a gridded weather *estimate* (a ~50km model/satellite
blend), never an on-site measurement, a sensor reading, or irrigation
advice. Never merged into sensor_observations, assessments, or alerts.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

import httpx

NASA_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
NASA_FILL = -999.0
NASA_TIMEOUT_S = 25.0
MAX_RANGE_DAYS = 366

UNITS = {
    "temperature": "degC",
    "relative_humidity": "%",
    "precipitation": "mm/day",
    "solar_radiation": "MJ/m2/day",
}
TIME_CONVENTION = "NASA POWER local solar time"

_PARAMETER_KEYS = {
    "temperature": "T2M",
    "relative_humidity": "RH2M",
    "precipitation": "PRECTOTCORR",
    "solar_radiation": "ALLSKY_SFC_SW_DWN",
}


class NasaPowerUnavailableError(RuntimeError):
    """NASA POWER could not provide daily weather for the request."""


class InvalidRequestError(ValueError):
    """The requested coordinates or date range are not acceptable."""


@dataclass(frozen=True)
class DailyWeatherDay:
    day: date
    temperature: float | None
    relative_humidity: float | None
    precipitation: float | None
    solar_radiation: float | None


@dataclass(frozen=True)
class DailyWeatherResult:
    latitude: float
    longitude: float
    start: date
    end: date
    days: list[DailyWeatherDay] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _client(timeout: float) -> httpx.AsyncClient:
    # A function so tests can swap in a mock transport (same pattern as
    # app/services/climate.py).
    return httpx.AsyncClient(timeout=timeout)


def validate_coordinates(latitude: float, longitude: float) -> None:
    if not (-90.0 <= latitude <= 90.0):
        raise InvalidRequestError(f"latitude {latitude} is out of range [-90, 90]")
    if not (-180.0 <= longitude <= 180.0):
        raise InvalidRequestError(f"longitude {longitude} is out of range [-180, 180]")


def validate_date_range(start: date, end: date) -> None:
    today = datetime.now(timezone.utc).date()
    if start > end:
        raise InvalidRequestError("start date must not be after end date")
    if start > today:
        raise InvalidRequestError("start date is entirely in the future; NASA POWER has no data yet")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise InvalidRequestError(f"date range may not exceed {MAX_RANGE_DAYS} days")


async def fetch_daily_weather(latitude: float, longitude: float, start: date, end: date) -> DailyWeatherResult:
    validate_coordinates(latitude, longitude)
    validate_date_range(start, end)

    params = {
        "parameters": ",".join(_PARAMETER_KEYS.values()),
        "community": "AG",
        "latitude": f"{latitude:.4f}",
        "longitude": f"{longitude:.4f}",
        "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
        "format": "JSON",
    }
    try:
        async with _client(NASA_TIMEOUT_S) as client:
            response = await client.get(NASA_URL, params=params)
        response.raise_for_status()
        payload = response.json()
        series = payload["properties"]["parameter"]
        fill_value = payload.get("header", {}).get("fill_value", NASA_FILL)
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
        # Deliberately no coordinates/params in this log line: keep it to a
        # generic failure message, not request details.
        raise NasaPowerUnavailableError("NASA POWER is not reachable right now.") from exc

    missing_counts = dict.fromkeys(_PARAMETER_KEYS, 0)
    days: list[DailyWeatherDay] = []
    current = start
    while current <= end:
        day_key = current.strftime("%Y%m%d")
        values: dict[str, float | None] = {}
        for label, nasa_key in _PARAMETER_KEYS.items():
            raw = series.get(nasa_key, {}).get(day_key)
            if raw is None or raw == fill_value or raw == NASA_FILL:
                values[label] = None
                missing_counts[label] += 1
            else:
                values[label] = raw
        days.append(
            DailyWeatherDay(
                day=current,
                temperature=values["temperature"],
                relative_humidity=values["relative_humidity"],
                precipitation=values["precipitation"],
                solar_radiation=values["solar_radiation"],
            )
        )
        current += timedelta(days=1)

    warnings = [
        f"{count} {label.replace('_', ' ')} value(s) missing"
        for label, count in missing_counts.items()
        if count > 0
    ]

    return DailyWeatherResult(
        latitude=latitude,
        longitude=longitude,
        start=start,
        end=end,
        days=days,
        warnings=warnings,
    )


@dataclass(frozen=True)
class WeatherSummary:
    total_days: int
    valid_counts: dict[str, int]
    missing_counts: dict[str, int]
    total_precipitation_mm: float | None
    precipitation_coverage_complete: bool
    mean_temperature_c: float | None
    mean_relative_humidity_pct: float | None
    mean_solar_radiation_mj_m2_day: float | None
    warnings: list[str] = field(default_factory=list)


def summarize_daily_weather(result: DailyWeatherResult) -> WeatherSummary:
    """Aggregate a fetched daily series. Pure function, no new HTTP calls --
    counts/means are computed only from valid (non-missing, non-sentinel)
    days, and a partial-coverage warning is always attached whenever any
    day is missing, so a partial sum is never silently presented as a
    complete-period total.
    """
    total_days = len(result.days)
    valid_counts: dict[str, int] = {}
    missing_counts: dict[str, int] = {}
    warnings: list[str] = []

    def _valid_values(attr: str) -> list[float]:
        values = [getattr(d, attr) for d in result.days if getattr(d, attr) is not None]
        valid_counts[attr] = len(values)
        missing_counts[attr] = total_days - len(values)
        return values

    temps = _valid_values("temperature")
    humidity = _valid_values("relative_humidity")
    precip = _valid_values("precipitation")
    solar = _valid_values("solar_radiation")

    warnings.extend(
        f"{label.replace('_', ' ')} missing for {missing_counts[label]} of {total_days} day(s); "
        f"aggregates reflect only the {valid_counts[label]} valid day(s)"
        for label in ("temperature", "relative_humidity", "precipitation", "solar_radiation")
        if missing_counts[label] > 0
    )

    implausible_negative_precip = [v for v in precip if v < 0]
    if implausible_negative_precip:
        precip = [v for v in precip if v >= 0]
        warnings.append(
            f"{len(implausible_negative_precip)} physically implausible negative "
            "precipitation value(s) excluded from the total"
        )

    precipitation_coverage_complete = missing_counts["precipitation"] == 0 and not implausible_negative_precip

    def _mean(values: list[float]) -> float | None:
        return round(sum(values) / len(values), 2) if values else None

    return WeatherSummary(
        total_days=total_days,
        valid_counts=valid_counts,
        missing_counts=missing_counts,
        total_precipitation_mm=round(sum(precip), 2) if precip else None,
        precipitation_coverage_complete=precipitation_coverage_complete,
        mean_temperature_c=_mean(temps),
        mean_relative_humidity_pct=_mean(humidity),
        mean_solar_radiation_mj_m2_day=_mean(solar),
        warnings=warnings,
    )
