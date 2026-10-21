"""Health updates: a farmer's photo-based plant health report, stored in MongoDB.

Each update keeps the photo (GridFS), a K-means segmentation mask of it, the
disease service's prediction, and the growing conditions from the farmer's
last crop suggestion. Every update is stored, healthy or not, so each field
builds up a health history.
"""

from collections.abc import Iterator
from contextlib import contextmanager, suppress
from datetime import UTC, datetime
from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from gridfs.errors import NoFile
from pymongo import DESCENDING, ReturnDocument
from pymongo.errors import ConnectionFailure

from app.core.config import get_settings
from app.db.mongo import health_updates, image_bucket
from app.ml.leaf_segmentation import segment_leaf
from app.ml.photo_quality import check_photo_quality
from app.schemas.health_update import (
    ConditionSource,
    HealthUpdateResponse,
    HealthUpdateUpdate,
)

router = APIRouter(tags=["health-updates"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 8 * 1024 * 1024
HEALTHY_STATUSES = {"healthy", "no disease detected"}


@contextmanager
def _mongo() -> Iterator[None]:
    try:
        yield
    except ConnectionFailure as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Health updates database (MongoDB) is not reachable. "
            "Start it with `docker compose up -d mongo` from the workspace root.",
        ) from exc


def _object_id(update_id: str) -> ObjectId:
    if not ObjectId.is_valid(update_id):
        raise HTTPException(status_code=404, detail="Health update not found")
    return ObjectId(update_id)


def _to_response(doc: dict[str, Any]) -> HealthUpdateResponse:
    update_id = str(doc["_id"])
    base = f"{get_settings().api_v1_prefix}/health-updates/{update_id}"
    return HealthUpdateResponse(
        id=update_id,
        **{k: v for k, v in doc.items() if k not in {"_id", "image_id", "mask_id"}},
        image_url=f"{base}/image" if doc.get("image_id") else None,
        mask_url=f"{base}/mask" if doc.get("mask_id") else None,
    )


def review_priority(confidence: float | None) -> float:
    """How soon an agronomist should look at a photo: the model's doubt, 0 (sure) to 1.

    A photo the model gave no answer for comes first, as does anything it was unsure of.
    This is the whole active-learning rule: label the photos the model knows least about.
    """
    if confidence is None:
        return 1.0
    return round(min(1.0, max(0.0, 1.0 - confidence / 100.0)), 3)


def _is_diseased(health_status: str) -> bool:
    """Fallback when the client didn't say: anything not plainly healthy counts."""
    return health_status.strip().casefold() not in HEALTHY_STATUSES


@router.get(
    "/health-updates",
    response_model=list[HealthUpdateResponse],
    summary="List health updates, newest first",
)
async def list_health_updates(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    diseased_only: bool = Query(False, description="Only updates with a disease or problem"),
):
    query = {"is_diseased": True} if diseased_only else {}
    with _mongo():
        cursor = (
            health_updates().find(query).sort("reported_at", DESCENDING).skip(skip).limit(limit)
        )
        return [_to_response(doc) async for doc in cursor]


@router.post(
    "/health-updates",
    response_model=HealthUpdateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a health update from a plant photo",
)
async def create_health_update(
    image: Annotated[
        UploadFile, File(description="Plant or leaf photo (JPG, PNG or WEBP, max 8 MB)")
    ],
    plant_type: Annotated[str, Form()],
    health_status: Annotated[str, Form()],
    reported_by: Annotated[str, Form()],
    disease_name: Annotated[str | None, Form()] = None,
    is_diseased: Annotated[bool | None, Form()] = None,
    township: Annotated[str | None, Form()] = None,
    notes: Annotated[str | None, Form()] = None,
    latitude: Annotated[float | None, Form()] = None,
    longitude: Annotated[float | None, Form()] = None,
    consent_to_train: Annotated[bool, Form()] = False,
    soil_ph: Annotated[float | None, Form(ge=0, le=14)] = None,
    rainfall_mm: Annotated[float | None, Form(ge=0)] = None,
    temperature_c: Annotated[float | None, Form(ge=-50, le=70)] = None,
    conditions_source: Annotated[ConditionSource, Form()] = "manual",
    conditions_captured_at: Annotated[datetime | None, Form()] = None,
    detection_group_id: Annotated[str | None, Form()] = None,
    detection_raw_class_name: Annotated[str | None, Form()] = None,
    detection_confidence: Annotated[float | None, Form()] = None,
    detection_severity: Annotated[str | None, Form()] = None,
    detection_affected_area: Annotated[str | None, Form()] = None,
):
    if image.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG or WEBP image.")
    image_bytes = await image.read()
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Image size exceeds the 8 MB limit.")

    try:
        segmentation = await run_in_threadpool(segment_leaf, image_bytes)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="The image could not be read.") from exc

    quality = await run_in_threadpool(check_photo_quality, image_bytes)
    now = datetime.now(UTC)
    detection = None
    if detection_raw_class_name or detection_confidence is not None:
        detection = {
            "group_id": detection_group_id,
            "raw_class_name": detection_raw_class_name,
            "confidence": detection_confidence,
            "severity": detection_severity,
            "estimated_affected_area": detection_affected_area,
        }

    with _mongo():
        bucket = image_bucket()
        image_id = await bucket.upload_from_stream(
            image.filename or "photo",
            image_bytes,
            metadata={"content_type": image.content_type, "kind": "original"},
        )
        mask_id = await bucket.upload_from_stream(
            f"{image.filename or 'photo'}.mask.png",
            segmentation.mask_png,
            metadata={"content_type": "image/png", "kind": "kmeans_mask", "source": image_id},
        )
        doc = {
            "plant_type": plant_type.strip(),
            "health_status": health_status.strip(),
            "disease_name": (disease_name or "").strip() or None,
            "is_diseased": _is_diseased(health_status) if is_diseased is None else is_diseased,
            "township": (township or "").strip() or None,
            "reported_by": reported_by.strip(),
            "notes": (notes or "").strip() or None,
            "latitude": latitude,
            "longitude": longitude,
            "conditions": {
                "soil_ph": soil_ph,
                "rainfall_mm": rainfall_mm,
                "temperature_c": temperature_c,
                "source": conditions_source,
                "captured_at": conditions_captured_at,
            },
            "detection": detection,
            "quality": {
                "ok": quality.ok,
                "reasons": quality.reasons,
                "metrics": quality.metrics,
            },
            "consent_to_train": consent_to_train,
            "review": None,
            "review_priority": review_priority(detection_confidence),
            "segmentation": {
                "affected_percent": segmentation.affected_percent,
                "leaf_coverage_percent": segmentation.leaf_coverage_percent,
                "k": segmentation.k,
                "clusters": [vars(c) for c in segmentation.clusters],
            },
            "image_id": image_id,
            "mask_id": mask_id,
            "reported_at": now,
            "updated_at": None,
        }
        result = await health_updates().insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_response(doc)


@router.get(
    "/health-updates/{update_id}",
    response_model=HealthUpdateResponse,
    summary="Get a health update by ID",
)
async def get_health_update(update_id: str):
    with _mongo():
        doc = await health_updates().find_one({"_id": _object_id(update_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Health update not found")
    return _to_response(doc)


@router.put(
    "/health-updates/{update_id}",
    response_model=HealthUpdateResponse,
    summary="Edit a health update's details (the photo is kept)",
)
async def update_health_update(update_id: str, data: HealthUpdateUpdate):
    changes = data.model_dump(exclude_unset=True)
    if changes.get("consent_to_train", True) is None:
        changes.pop("consent_to_train")  # a null can't mean "withdrawn"
    if "conditions" in changes and data.conditions is not None:
        changes["conditions"] = data.conditions.model_dump()
    if "health_status" in changes and "is_diseased" not in changes:
        changes["is_diseased"] = _is_diseased(changes["health_status"])
    changes["updated_at"] = datetime.now(UTC)
    with _mongo():
        doc = await health_updates().find_one_and_update(
            {"_id": _object_id(update_id)},
            {"$set": changes},
            return_document=ReturnDocument.AFTER,
        )
    if not doc:
        raise HTTPException(status_code=404, detail="Health update not found")
    return _to_response(doc)


@router.delete(
    "/health-updates/{update_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a health update and its stored images",
)
async def delete_health_update(update_id: str):
    with _mongo():
        doc = await health_updates().find_one_and_delete({"_id": _object_id(update_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Health update not found")
        bucket = image_bucket()
        for key in ("image_id", "mask_id"):
            if doc.get(key):
                with suppress(NoFile):
                    await bucket.delete(doc[key])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _stream_image(update_id: str, key: str) -> Response:
    with _mongo():
        doc = await health_updates().find_one({"_id": _object_id(update_id)}, {key: 1})
        if not doc or not doc.get(key):
            raise HTTPException(status_code=404, detail="Image not found")
        try:
            stream = await image_bucket().open_download_stream(doc[key])
        except NoFile as exc:
            raise HTTPException(status_code=404, detail="Image not found") from exc
        content = await stream.read()
    media_type = (stream.metadata or {}).get("content_type", "application/octet-stream")
    return Response(
        content, media_type=media_type, headers={"Cache-Control": "private, max-age=86400"}
    )


@router.get("/health-updates/{update_id}/image", summary="The original uploaded photo")
async def get_health_update_image(update_id: str):
    return await _stream_image(update_id, "image_id")


@router.get("/health-updates/{update_id}/mask", summary="The K-means segmentation mask (PNG)")
async def get_health_update_mask(update_id: str):
    return await _stream_image(update_id, "mask_id")
