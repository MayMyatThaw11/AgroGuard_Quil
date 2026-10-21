from datetime import datetime
from typing import Literal

from app.schemas.base import APIModel


class ForecastPoint(APIModel):
    at: datetime
    p50: float | None
    p10: float | None = None
    p90: float | None = None


class WaterForecastResponse(APIModel):
    field_id: int
    evidence_status: Literal["ok", "insufficient_data"]
    reason: str | None
    sample_count: int
    horizon_hours: int | None
    points: list[ForecastPoint]
    model_version: str | None
    evaluated_pairs: int | None
    within_range_count: int | None
