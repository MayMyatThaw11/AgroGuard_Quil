"""Plant photos: a quality check before diagnosis, and the agronomist review loop.

Photos arrive through health updates (see health_updates.py) with the farmer's consent
flag. Reviewing is how this API gets real, Myanmar-labelled examples for a better disease
model: the queue puts the photos the current model knows least about first (active
learning), an agronomist labels them, and the labelled export feeds training.

The review routes sit behind AGROGUARD_REVIEW_TOKEN because their output becomes training
data; with no token set they are switched off. This API has no other sign-in, so keep the
token out of the browser bundle: the agronomist types it into the review page.
"""

import hmac
from datetime import UTC, datetime
from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pymongo import ASCENDING, DESCENDING

from app.api.v1.endpoints.health_updates import (
    ALLOWED_TYPES,
    MAX_FILE_SIZE,
    _mongo,
    _object_id,
)
from app.core.config import get_settings
from app.db.mongo import health_updates
from app.ml.photo_quality import check_photo_quality
from app.schemas.photo import (
    LabelledPhoto,
    PhotoQualityResult,
    PhotoReview,
    PhotoReviewRequest,
    ReviewQueueItem,
)

router = APIRouter(tags=["photos"])

REVIEW_TOKEN_HEADER = "X-AgroGuard-Review-Token"


def _require_reviewer(token: str | None) -> None:
    expected = get_settings().review_token
    if expected is None or not expected.get_secret_value():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Photo review is off: set AGROGUARD_REVIEW_TOKEN on the server to turn it on.",
        )
    if token is None or not hmac.compare_digest(token, expected.get_secret_value()):
        raise HTTPException(status_code=401, detail="That review token is not right.")


def _urls(doc: dict[str, Any]) -> tuple[str | None, str | None]:
    base = f"{get_settings().api_v1_prefix}/health-updates/{doc['_id']}"
    return (
        f"{base}/image" if doc.get("image_id") else None,
        f"{base}/mask" if doc.get("mask_id") else None,
    )


def _queue_item(doc: dict[str, Any]) -> ReviewQueueItem:
    image_url, mask_url = _urls(doc)
    return ReviewQueueItem(
        id=str(doc["_id"]),
        image_url=image_url,
        mask_url=mask_url,
        plant_type=doc["plant_type"],
        health_status=doc["health_status"],
        disease_name=doc.get("disease_name"),
        detection=doc.get("detection"),
        quality=doc.get("quality"),
        priority=float(doc.get("review_priority", 1.0)),
        reported_at=doc["reported_at"],
    )


@router.post(
    "/photos/quality",
    response_model=PhotoQualityResult,
    summary="Check whether a plant photo is good enough to diagnose from",
)
async def photo_quality(
    image: Annotated[UploadFile, File(description="Plant photo (JPG, PNG or WEBP, max 8 MB)")],
):
    if image.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG or WEBP image.")
    data = await image.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Image size exceeds the 8 MB limit.")
    return await run_in_threadpool(check_photo_quality, data)


@router.get(
    "/photos/review-queue",
    response_model=list[ReviewQueueItem],
    summary="Consented photos awaiting an agronomist, least certain first",
)
async def review_queue(
    limit: int = Query(20, ge=1, le=100),
    token: Annotated[str | None, Header(alias=REVIEW_TOKEN_HEADER)] = None,
):
    _require_reviewer(token)
    waiting = {"consent_to_train": True, "review": None, "image_id": {"$ne": None}}
    with _mongo():
        cursor = (
            health_updates()
            .find(waiting)
            .sort([("review_priority", DESCENDING), ("reported_at", ASCENDING)])
            .limit(limit)
        )
        return [_queue_item(doc) async for doc in cursor]


@router.post(
    "/photos/{update_id}/review",
    response_model=PhotoReview,
    summary="Record an agronomist's verdict on one photo",
)
async def review_photo(
    update_id: str,
    body: PhotoReviewRequest,
    token: Annotated[str | None, Header(alias=REVIEW_TOKEN_HEADER)] = None,
):
    _require_reviewer(token)
    plant = (body.plant or "").strip() or None
    condition = (body.condition or "").strip() or None
    if body.usable and not (plant and (body.is_healthy is True or condition)):
        raise HTTPException(
            status_code=422,
            detail="A usable photo needs the plant and either 'healthy' or the condition.",
        )
    review = {
        "reviewer": body.reviewer.strip(),
        "usable": body.usable,
        "plant": plant if body.usable else None,
        "condition": condition if body.usable else None,
        "is_healthy": body.is_healthy if body.usable else None,
        "note": (body.note or "").strip() or None,
        "reviewed_at": datetime.now(UTC),
    }
    with _mongo():
        found = await health_updates().find_one(
            {"_id": _object_id(update_id)}, {"consent_to_train": 1}
        )
        if not found:
            raise HTTPException(status_code=404, detail="Photo not found")
        if not found.get("consent_to_train"):
            raise HTTPException(
                status_code=409, detail="The farmer has not agreed to this photo being reviewed."
            )
        # Only an unreviewed photo can be labelled: a second reviewer can't silently overwrite.
        result = await health_updates().update_one(
            {"_id": ObjectId(update_id), "review": None}, {"$set": {"review": review}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=409, detail="This photo has already been reviewed.")
    return PhotoReview(**review)


@router.get(
    "/photos/labelled",
    response_model=list[LabelledPhoto],
    summary="Reviewed photos the farmer agreed to share, as training examples",
)
async def labelled_photos(
    limit: int = Query(500, ge=1, le=5000),
    token: Annotated[str | None, Header(alias=REVIEW_TOKEN_HEADER)] = None,
):
    _require_reviewer(token)
    # Consent is checked here, not only when queueing, so withdrawing it later removes the photo.
    ready = {"consent_to_train": True, "review.usable": True, "image_id": {"$ne": None}}
    with _mongo():
        cursor = health_updates().find(ready).sort("reported_at", ASCENDING).limit(limit)
        items = []
        async for doc in cursor:
            detection = doc.get("detection") or {}
            items.append(
                LabelledPhoto(
                    id=str(doc["_id"]),
                    image_url=_urls(doc)[0],
                    group_id=detection.get("group_id"),
                    model_guess=detection.get("raw_class_name"),
                    model_confidence=detection.get("confidence"),
                    farmer_plant_type=doc["plant_type"],
                    farmer_disease_name=doc.get("disease_name"),
                    review=PhotoReview(**doc["review"]),
                )
            )
        return items
