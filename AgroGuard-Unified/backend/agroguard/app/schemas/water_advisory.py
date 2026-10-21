"""Request/response contracts for the v2 irrigation advisory layer.

This is strictly additive: it does not touch `water_irrigation.py`'s own
schemas (`MoistureMeasurement`, `TargetVolumetricContent`, `RootDepth`),
it reuses them directly so the deficit math stays in exactly one place.
"""

from datetime import date
from typing import Literal

from app.schemas.base import APIModel
from app.schemas.water_irrigation import (
    IrrigationEstimateResponse,
    MoistureMeasurement,
    RootDepth,
    SourceType,
    TargetVolumetricContent,
    VwcUnit,
)

WaterManagementMode = Literal["upland", "paddy_awd"]
AdvisoryStatus = Literal["irrigate", "wait", "monitor", "insufficient_data"]
RainfallPeriod = Literal["last_24h", "next_24h_forecast"]


class VerifiedMoistureThreshold(APIModel):
    """A crop/stage-specific "irrigate below this" moisture value, supplied
    by the caller from an identifiable source -- never a built-in default.
    """

    value: float
    unit: VwcUnit
    source: SourceType
    source_note: str | None = None


class RainfallInput(APIModel):
    amount_mm: float
    period: RainfallPeriod
    source: SourceType
    measured_at: date | None = None
    source_note: str | None = None


class SensorQualityInput(APIModel):
    """Caller-supplied summary of this reading's trustworthiness. This
    module never queries the database itself for corroboration/staleness
    (see `sensor_quality.py`/`observation.py`) -- the caller (an endpoint
    that already has a session, or a future orchestration layer) computes
    these and passes them in, keeping the decision function pure and
    synchronous.
    """

    quality: Literal["unconfirmed", "confirmed", "contradicted"] | None = None
    reading_age_minutes: float | None = None
    is_stale: bool | None = None


class PaddyDepthInput(APIModel):
    """Standing-water depth for paddy fields, in centimeters -- never to be
    confused with volumetric soil moisture (fraction/percent). Negative
    values mean the field has drained below the soil surface.
    """

    value_cm: float
    source: SourceType
    measured_at: date | None = None
    source_note: str | None = None


class PaddyAwdThreshold(APIModel):
    """A vetted, explicitly supplied AWD "irrigate at or below this depth"
    threshold in cm. There is no built-in -15 cm default anywhere in this
    module; a caller must provide this value and its source for paddy mode
    to produce anything but `insufficient_data`.
    """

    lower_bound_cm: float
    source: SourceType
    source_note: str | None = None


class WaterAdvisoryRequest(APIModel):
    field_id: int | None = None
    water_management_mode: WaterManagementMode = "upland"
    crop_type: str | None = None
    crop_stage: str | None = None

    # Upland root-zone path -- the exact same typed inputs water_irrigation
    # already validates; reused, not duplicated.
    moisture_measurement: MoistureMeasurement | None = None
    target_volumetric_content: TargetVolumetricContent | None = None
    representative_root_depth_m: RootDepth | None = None
    irrigation_efficiency: float | None = None
    field_area_m2: float | None = None

    # A simpler, qualitative alternative to target_volumetric_content when
    # a verified crop/stage threshold exists but a lab-verified "target"
    # and/or root depth do not -- gives irrigate/wait/monitor without a
    # quantity.
    verified_threshold: VerifiedMoistureThreshold | None = None

    rainfall: RainfallInput | None = None
    sensor_quality: SensorQualityInput | None = None

    # Paddy AWD path -- entirely separate fields/units from the above;
    # never auto-derived from a percentage reading.
    paddy_depth: PaddyDepthInput | None = None
    paddy_awd_threshold: PaddyAwdThreshold | None = None


class WaterAdvisoryResponse(APIModel):
    status: AdvisoryStatus
    reason_code: str
    reason: str
    reason_my: str | None = None
    inputs_used: dict = {}
    missing_inputs: list[str] = []
    data_quality: Literal["high", "medium", "low", "unknown"] = "unknown"
    assumptions: list[str] = []
    deficit_estimate: IrrigationEstimateResponse | None = None
    advisory_only: Literal[True] = True
