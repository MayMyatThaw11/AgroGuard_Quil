from datetime import datetime

from pydantic import Field

from app.schemas.base import APIModel
from app.schemas.health_update import DiseaseDetection


class PhotoQualityResult(APIModel):
    """Whether a photo is good enough to diagnose from (see app/ml/photo_quality.py)."""

    ok: bool
    # Machine-readable codes (unreadable, too_small, blurry, too_dark, too_bright, uniform);
    # the screens turn them into plain-language retake tips.
    reasons: list[str] = []
    metrics: dict[str, float] = {}


class PhotoReviewRequest(APIModel):
    """An agronomist's verdict on one photo."""

    reviewer: str = Field(min_length=1, max_length=80)
    # False when the photo can't be judged (blurry, wrong subject): no label is needed then.
    usable: bool = True
    plant: str | None = Field(default=None, max_length=100)
    condition: str | None = Field(default=None, max_length=120)
    is_healthy: bool | None = None
    note: str | None = Field(default=None, max_length=500)


class PhotoReview(APIModel):
    reviewer: str
    usable: bool
    plant: str | None = None
    condition: str | None = None
    is_healthy: bool | None = None
    note: str | None = None
    reviewed_at: datetime


class ReviewQueueItem(APIModel):
    id: str
    image_url: str | None = None
    mask_url: str | None = None
    # What the farmer saved, and what the model said, so the reviewer sees both.
    plant_type: str
    health_status: str
    disease_name: str | None = None
    detection: DiseaseDetection | None = None
    quality: PhotoQualityResult | None = None
    # 0 to 1, higher = review sooner. The model's doubt (1 - confidence); 1 when it gave no answer.
    priority: float
    reported_at: datetime


class LabelledPhoto(APIModel):
    """A consented, reviewed photo, ready to be used as a training example."""

    id: str
    image_url: str | None = None
    group_id: str | None = None
    model_guess: str | None = None
    model_confidence: float | None = None
    farmer_plant_type: str
    farmer_disease_name: str | None = None
    review: PhotoReview
