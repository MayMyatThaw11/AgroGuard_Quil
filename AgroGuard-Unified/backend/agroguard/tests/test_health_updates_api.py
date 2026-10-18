"""Health updates API against a real MongoDB (`docker compose up -d mongo`).

Uses a throwaway `agroguard_test` database and skips when MongoDB isn't running.
"""

import io

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from PIL import Image, ImageDraw
from pymongo import AsyncMongoClient
from pymongo.errors import ConnectionFailure

from app.core.config import get_settings
from app.db import mongo
from app.main import app

TEST_DB = "agroguard_test"

pytestmark = pytest.mark.asyncio


def _leaf_png() -> bytes:
    image = Image.new("RGB", (240, 240), (150, 150, 155))
    draw = ImageDraw.Draw(image)
    draw.ellipse((30, 40, 210, 200), fill=(52, 140, 48))
    draw.ellipse((90, 90, 130, 130), fill=(120, 70, 30))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest_asyncio.fixture
async def mongo_db(monkeypatch):
    client = AsyncMongoClient(get_settings().mongo_url, serverSelectionTimeoutMS=1500, tz_aware=True)
    try:
        await client.admin.command("ping")
    except ConnectionFailure:
        await client.close()
        pytest.skip("MongoDB is not running")
    await client.drop_database(TEST_DB)
    monkeypatch.setattr(mongo, "get_database", lambda: client[TEST_DB])
    yield client[TEST_DB]
    await client.drop_database(TEST_DB)
    await client.close()


@pytest_asyncio.fixture
async def api():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


def _form(**overrides) -> dict[str, str]:
    form = {
        "plant_type": "Tomato",
        "health_status": "Diseased (Action Needed)",
        "disease_name": "Septoria Leaf Spot",
        "is_diseased": "true",
        "reported_by": "Aung",
        "township": "Hlegu",
        "soil_ph": "6.5",
        "rainfall_mm": "120",
        "temperature_c": "28",
        "conditions_source": "crop_suggestion",
        "detection_group_id": "Group_5_Vegetables_Vine_Fruits",
        "detection_raw_class_name": "Tomato_Leaf___Septoria_Leaf_Spot",
        "detection_confidence": "97.5",
    }
    form.update(overrides)
    return form


async def _create(api, **overrides):
    files = {"image": ("leaf.png", _leaf_png(), "image/png")}
    return await api.post("/api/v1/health-updates", data=_form(**overrides), files=files)


async def test_create_stores_photo_mask_and_conditions(mongo_db, api) -> None:
    response = await _create(api)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["plantType"] == "Tomato"
    assert body["isDiseased"] is True
    assert body["conditions"] == {
        "soilPh": 6.5,
        "rainfallMm": 120.0,
        "temperatureC": 28.0,
        "source": "crop_suggestion",
        "capturedAt": None,
    }
    assert body["detection"]["rawClassName"] == "Tomato_Leaf___Septoria_Leaf_Spot"
    assert 0 < body["segmentation"]["affectedPercent"] < 20

    image = await api.get(body["imageUrl"])
    assert image.status_code == 200 and image.headers["content-type"] == "image/png"
    mask = await api.get(body["maskUrl"])
    assert mask.status_code == 200
    assert Image.open(io.BytesIO(mask.content)).format == "PNG"
    assert await mongo_db["health_images.files"].count_documents({}) == 2


async def test_every_update_is_stored_and_can_be_filtered(mongo_db, api) -> None:
    await _create(api)
    await _create(api, health_status="Healthy", disease_name="", is_diseased="false")

    everything = (await api.get("/api/v1/health-updates")).json()
    assert len(everything) == 2
    diseased = (await api.get("/api/v1/health-updates", params={"diseased_only": "true"})).json()
    assert [u["diseaseName"] for u in diseased] == ["Septoria Leaf Spot"]


async def test_edit_keeps_photo_and_delete_removes_images(mongo_db, api) -> None:
    created = (await _create(api)).json()
    edited = await api.put(
        f"/api/v1/health-updates/{created['id']}",
        json={"healthStatus": "Healthy", "notes": "Recovered after spraying"},
    )
    assert edited.status_code == 200
    assert edited.json()["isDiseased"] is False
    assert edited.json()["imageUrl"] == created["imageUrl"]

    deleted = await api.delete(f"/api/v1/health-updates/{created['id']}")
    assert deleted.status_code == 204
    assert await mongo_db["health_images.files"].count_documents({}) == 0
    assert (await api.get(f"/api/v1/health-updates/{created['id']}")).status_code == 404


async def test_rejects_non_image_upload(mongo_db, api) -> None:
    files = {"image": ("notes.txt", b"hello", "text/plain")}
    response = await api.post("/api/v1/health-updates", data=_form(), files=files)
    assert response.status_code == 400
