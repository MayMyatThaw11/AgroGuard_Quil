from datetime import date
from typing import Literal

from app.schemas.base import APIModel


class WaterWeatherByLocationRequest(APIModel):
    latitude: float
    longitude: float
    start_date: date
    end_date: date


class DailyWeatherDayResponse(APIModel):
    date: date
    temperature: float | None
    relative_humidity: float | None
    precipitation: float | None
    solar_radiation: float | None


class WaterWeatherSummaryResponse(APIModel):
    source: str
    dataset: str
    latitude: float
    longitude: float
    start_date: date
    end_date: date
    time_convention: str
    units: dict[str, str]
    total_days: int
    valid_counts: dict[str, int]
    missing_counts: dict[str, int]
    total_precipitation_mm: float | None
    precipitation_coverage_complete: bool
    mean_temperature_c: float | None
    mean_relative_humidity_pct: float | None
    mean_solar_radiation_mj_m2_day: float | None
    warnings: list[str]


class WaterWeatherResponse(APIModel):
    source: str
    dataset: str
    location_mode: Literal["saved_field", "device_location"]
    field_id: int | None
    latitude: float
    longitude: float
    start_date: date
    end_date: date
    time_convention: str
    units: dict[str, str]
    days: list[DailyWeatherDayResponse]
    warnings: list[str]
