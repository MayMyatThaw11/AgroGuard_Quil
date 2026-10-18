from datetime import datetime
from typing import Literal

from app.schemas.base import APIModel

ConditionSource = Literal["crop_suggestion", "manual"]


class GrowingConditions(APIModel):
    soil_ph: float | None = None
    rainfall_mm: float | None = None
    temperature_c: float | None = None
    # Where the values came from: the farmer's last Crop Suggestion run, or typed in.
    source: ConditionSource = "manual"
    captured_at: datetime | None = None


class DiseaseDetection(APIModel):
    """What the plant disease service (:8001) reported for the photo."""

    group_id: str | None = None
    raw_class_name: str | None = None
    confidence: float | None = None
    severity: str | None = None
    estimated_affected_area: str | None = None


class ClusterInfo(APIModel):
    label: str
    share_percent: float
    hue_deg: float
    saturation: float
    value: float


class Segmentation(APIModel):
    """K-means colour segmentation of the photo (see app/ml/leaf_segmentation.py)."""

    affected_percent: float
    leaf_coverage_percent: float
    k: int
    clusters: list[ClusterInfo]


class HealthUpdateUpdate(APIModel):
    plant_type: str | None = None
    health_status: str | None = None
    disease_name: str | None = None
    is_diseased: bool | None = None
    township: str | None = None
    reported_by: str | None = None
    notes: str | None = None
    conditions: GrowingConditions | None = None


class HealthUpdateResponse(APIModel):
    id: str
    plant_type: str
    health_status: str
    disease_name: str | None = None
    is_diseased: bool
    township: str | None = None
    reported_by: str
    notes: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    conditions: GrowingConditions
    detection: DiseaseDetection | None = None
    segmentation: Segmentation | None = None
    image_url: str | None = None
    mask_url: str | None = None
    reported_at: datetime
    updated_at: datetime | None = None
