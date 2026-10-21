from datetime import datetime

from app.schemas.base import APIModel


class RecentUpdate(APIModel):
    plant_type: str
    health_status: str
    disease_name: str | None = None
    township: str | None = None
    reported_at: datetime | None = None


class FarmRecords(APIModel):
    """From the health updates farmers saved in MongoDB; unavailable when it is not running."""

    available: bool
    total: int | None = None
    diseased: int | None = None
    recent: list[RecentUpdate] = []
    source: str = "AgroGuard health updates (MongoDB)"


class PriceByCountry(APIModel):
    country: str
    usd_per_tonne: float
    year: int


class PricePoint(APIModel):
    year: int
    median_usd_per_tonne: float


class AseanPrices(APIModel):
    crop: str
    source: str
    as_of: int | None = None
    countries: list[PriceByCountry]
    trend: list[PricePoint]


class MyanmarCrop(APIModel):
    crop: str
    crop_mm: str | None = None
    area_ha: int
    share_percent: float
    yield_t_per_ha: float | None = None


class MyanmarCrops(APIModel):
    source: str
    year: int | None = None
    total_area_ha: int | None = None
    other_share_percent: float | None = None
    crops: list[MyanmarCrop]


class DashboardResponse(APIModel):
    records: FarmRecords
    prices: AseanPrices
    price_crops: list[str]
    price_crop_names_mm: dict[str, str] = {}
    myanmar: MyanmarCrops
