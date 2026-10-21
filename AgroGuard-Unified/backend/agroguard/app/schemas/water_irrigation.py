from datetime import date
from typing import Literal

from app.schemas.base import APIModel

SourceType = Literal["measured", "lab_report", "farmer_declared", "reference_derived"]
VwcUnit = Literal["m3/m3", "percent_vwc"]


class MoistureMeasurement(APIModel):
    value: float
    unit: VwcUnit
    basis: Literal["measured_volumetric"]
    source: SourceType
    measured_at: date | None = None
    source_note: str | None = None


class TargetVolumetricContent(APIModel):
    value: float
    unit: VwcUnit = "m3/m3"
    source: SourceType
    source_note: str | None = None


class RootDepth(APIModel):
    value: float
    source: SourceType
    source_note: str | None = None


class IrrigationEstimateRequest(APIModel):
    field_id: int | None = None
    moisture_measurement: MoistureMeasurement | None = None
    target_volumetric_content: TargetVolumetricContent | None = None
    representative_root_depth_m: RootDepth | None = None
    irrigation_efficiency: float | None = None
    field_area_m2: float | None = None


class IrrigationEstimateResponse(APIModel):
    status: Literal["estimate_available", "insufficient_data"]
    method: str | None = None
    net_depth_mm: float | None = None
    gross_depth_mm: float | None = None
    gross_volume_liters: float | None = None
    missing_inputs: list[str] = []
    limitations: list[str] = []
    validated_for_farm_use: bool = False
