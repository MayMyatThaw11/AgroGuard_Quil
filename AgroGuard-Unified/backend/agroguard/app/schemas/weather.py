from typing import Literal

from pydantic import BaseModel


class LocationWeatherRequest(BaseModel):
    latitude: float
    longitude: float
    language: Literal["en", "my"] = "en"


class RegionInfo(BaseModel):
    name_en: str
    name_my: str
    # False for points outside Myanmar: the name is then a placeholder, not the nearest region.
    in_myanmar: bool = True


class CurrentWeather(BaseModel):
    temperature_c: float
    # Average weekly rainfall (annual / 52). Kept for older clients; the crop
    # model itself works on rainfall_annual_mm.
    rainfall_7d_mm: float
    rainfall_annual_mm: float | None = None
    humidity_pct: int
    # None when no soil pH could be found for the point: the client keeps the user's value.
    soil_pH_estimate: float | None = None
    climate_source: str = ""
    soil_ph_source: Literal["soilgrids", "regional_estimate", "unavailable"] = "unavailable"


class Advisory(BaseModel):
    severity: Literal["info", "warning", "critical"]
    icon: str
    title_en: str
    title_my: str
    message_en: str
    message_my: str


class LocationWeatherResponse(BaseModel):
    region: RegionInfo
    current: CurrentWeather
    advisories: list[Advisory]
