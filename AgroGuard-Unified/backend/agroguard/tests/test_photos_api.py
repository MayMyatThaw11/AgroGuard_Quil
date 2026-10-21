"""Photo quality check, consent, and the agronomist review loop (real MongoDB).

Uses a throwaway `agroguard_test` database and skips when MongoDB isn't running.
"""

import io

import numpy as np
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from PIL import Image, ImageDraw, ImageFilter
from pydantic import SecretStr
from pymongo import AsyncMongoClient
from pymongo.errors import ConnectionFailure

from app.api.v1.endpoints.health_updates import review_priority
from app.core.config import Settings, get_settings
from app.db import mongo
from app.main import app

TEST_DB = "agroguard_test"
TOKEN = {"X-AgroGuard-Review-Token": "review-secret"}

pytestmark = pytest.mark.asyncio


def _leaf(blur: float = 0.0) -> bytes:
    rng = np.random.default_rng(7)
    image = Image.fromarray(np.full((600, 600, 3), (150, 150, 155), dtype=np.uint8))
    draw = ImageDraw.Draw(image)
    draw.ellipse((60, 90, 540, 510), fill=(52, 140, 48))
    for _ in range(40):
        x, y = rng.integers(120, 480, 2)
        draw.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(120, 70, 30))
    if blur:
        image = image.filter(ImageFilter.GaussianBlur(blur))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=88)
    return buffer.getvalue()


@pytest_asyncio.fixture
async def mongo_db(monkeypatch):
    client = AsyncMongoClient(
        get_settings().mongo_url, serverSelectionTimeoutMS=1500, tz_aware=True
    )
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
async def api(monkeypatch):
    monkeypatch.setattr(get_settings(), "review_token", SecretStr("review-secret"))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def _save(api, *, consent: bool, confidence: float | None, blur: float = 0.0, **extra):
    form = {
        "plant_type": "Tomato",
        "health_status": "Diseased (Action Needed)",
        "disease_name": "Septoria Leaf Spot",
        "is_diseased": "true",
        "reported_by": "Aung",
        "consent_to_train": str(consent).lower(),
        **extra,
    }
    if confidence is not None:
        form["detection_raw_class_name"] = "Tomato_Leaf___Septoria_Leaf_Spot"
        form["detection_confidence"] = str(confidence)
        form["detection_group_id"] = "Group_5_Vegetables_Vine_Fruits"
    files = {"image": ("leaf.jpg", _leaf(blur), "image/jpeg")}
    response = await api.post("/api/v1/health-updates", data=form, files=files)
    assert response.status_code == 201, response.text
    return response.json()


# ── the stateless quality check ──────────────────────────────────────────────


async def test_quality_endpoint_passes_a_good_photo_and_flags_a_blurry_one(api) -> None:
    good = await api.post(
        "/api/v1/photos/quality", files={"image": ("a.jpg", _leaf(), "image/jpeg")}
    )
    assert good.status_code == 200 and good.json()["ok"] is True
    blurry = await api.post(
        "/api/v1/photos/quality", files={"image": ("b.jpg", _leaf(blur=5), "image/jpeg")}
    )
    assert blurry.json()["ok"] is False and blurry.json()["reasons"] == ["blurry"]


async def test_quality_endpoint_rejects_non_images(api) -> None:
    res = await api.post("/api/v1/photos/quality", files={"image": ("n.txt", b"hi", "text/plain")})
    assert res.status_code == 400


# ── consent and what gets stored ─────────────────────────────────────────────


async def test_the_quality_check_and_consent_are_stored_with_the_report(mongo_db, api) -> None:
    saved = await _save(api, consent=True, confidence=92.0)
    assert saved["consentToTrain"] is True and saved["review"] is None
    assert saved["quality"]["ok"] is True and saved["quality"]["metrics"]["width"] == 600
    stored = await mongo_db["health_updates"].find_one()
    assert stored["review_priority"] == pytest.approx(0.08)


async def test_consent_defaults_to_no(mongo_db, api) -> None:
    saved = await _save(api, consent=False, confidence=50.0)
    assert saved["consentToTrain"] is False


async def test_review_priority_is_the_models_doubt() -> None:
    assert review_priority(None) == 1.0
    assert review_priority(100.0) == 0.0
    assert review_priority(40.0) == pytest.approx(0.6)
    assert 0.0 <= review_priority(250.0) <= 1.0 and review_priority(-5.0) == 1.0


# ── the review queue (active learning) ───────────────────────────────────────


async def test_review_routes_need_the_token_and_are_off_without_one(
    mongo_db, api, monkeypatch
) -> None:
    assert (await api.get("/api/v1/photos/review-queue")).status_code == 401
    wrong = await api.get(
        "/api/v1/photos/review-queue", headers={"X-AgroGuard-Review-Token": "nope"}
    )
    assert wrong.status_code == 401
    monkeypatch.setattr(get_settings(), "review_token", None)
    assert (await api.get("/api/v1/photos/review-queue", headers=TOKEN)).status_code == 503


async def test_a_blank_review_token_is_not_a_token(monkeypatch) -> None:
    monkeypatch.setenv("AGROGUARD_REVIEW_TOKEN", "  ")
    assert Settings().review_token is None


async def test_the_queue_shows_only_consented_unreviewed_photos_least_sure_first(
    mongo_db, api
) -> None:
    sure = await _save(api, consent=True, confidence=97.0)
    unsure = await _save(api, consent=True, confidence=41.0)
    none_given = await _save(api, consent=True, confidence=None)
    await _save(api, consent=False, confidence=10.0)  # no consent: never queued
    queue = (await api.get("/api/v1/photos/review-queue", headers=TOKEN)).json()
    assert [item["id"] for item in queue] == [none_given["id"], unsure["id"], sure["id"]]
    assert queue[0]["priority"] == 1.0 and queue[1]["priority"] == pytest.approx(0.59)
    assert queue[1]["detection"]["rawClassName"] == "Tomato_Leaf___Septoria_Leaf_Spot"
    assert queue[1]["imageUrl"].endswith("/image")
    limited = (await api.get("/api/v1/photos/review-queue?limit=1", headers=TOKEN)).json()
    assert [item["id"] for item in limited] == [none_given["id"]]


async def test_a_reviewed_photo_leaves_the_queue_and_appears_in_the_export(mongo_db, api) -> None:
    saved = await _save(api, consent=True, confidence=60.0)
    verdict = {"reviewer": "Dr Aye", "plant": "Tomato", "condition": "Septoria leaf spot"}
    done = await api.post(f"/api/v1/photos/{saved['id']}/review", json=verdict, headers=TOKEN)
    assert done.status_code == 200 and done.json()["usable"] is True
    assert (await api.get("/api/v1/photos/review-queue", headers=TOKEN)).json() == []
    export = (await api.get("/api/v1/photos/labelled", headers=TOKEN)).json()
    assert len(export) == 1
    row = export[0]
    assert (
        row["review"]["condition"] == "Septoria leaf spot" and row["review"]["reviewer"] == "Dr Aye"
    )
    assert (
        row["modelGuess"] == "Tomato_Leaf___Septoria_Leaf_Spot" and row["modelConfidence"] == 60.0
    )
    assert row["farmerPlantType"] == "Tomato" and row["groupId"] == "Group_5_Vegetables_Vine_Fruits"


async def test_a_photo_can_only_be_reviewed_once(mongo_db, api) -> None:
    saved = await _save(api, consent=True, confidence=60.0)
    verdict = {"reviewer": "Dr Aye", "plant": "Tomato", "is_healthy": True}
    url = f"/api/v1/photos/{saved['id']}/review"
    assert (await api.post(url, json=verdict, headers=TOKEN)).status_code == 200
    again = await api.post(url, json={**verdict, "reviewer": "Someone else"}, headers=TOKEN)
    assert again.status_code == 409


async def test_a_usable_photo_needs_a_label_but_an_unusable_one_does_not(mongo_db, api) -> None:
    saved = await _save(api, consent=True, confidence=30.0)
    url = f"/api/v1/photos/{saved['id']}/review"
    missing = await api.post(url, json={"reviewer": "Dr Aye", "usable": True}, headers=TOKEN)
    assert missing.status_code == 422
    unusable = await api.post(
        url, json={"reviewer": "Dr Aye", "usable": False, "note": "out of focus"}, headers=TOKEN
    )
    assert unusable.status_code == 200
    assert (
        await api.get("/api/v1/photos/labelled", headers=TOKEN)
    ).json() == []  # not training data


async def test_photos_without_consent_cannot_be_reviewed_and_withdrawing_removes_them(
    mongo_db, api
) -> None:
    no_consent = await _save(api, consent=False, confidence=20.0)
    blocked = await api.post(
        f"/api/v1/photos/{no_consent['id']}/review",
        json={"reviewer": "Dr Aye", "plant": "Tomato", "is_healthy": True},
        headers=TOKEN,
    )
    assert blocked.status_code == 409

    saved = await _save(api, consent=True, confidence=20.0)
    verdict = {"reviewer": "Dr Aye", "plant": "Tomato", "is_healthy": True}
    await api.post(f"/api/v1/photos/{saved['id']}/review", json=verdict, headers=TOKEN)
    assert len((await api.get("/api/v1/photos/labelled", headers=TOKEN)).json()) == 1
    withdrawn = await api.put(
        f"/api/v1/health-updates/{saved['id']}", json={"consentToTrain": False}
    )
    assert withdrawn.status_code == 200 and withdrawn.json()["consentToTrain"] is False
    assert (await api.get("/api/v1/photos/labelled", headers=TOKEN)).json() == []


async def test_an_edit_that_does_not_mention_consent_keeps_it(mongo_db, api) -> None:
    saved = await _save(api, consent=True, confidence=70.0)
    edited = await api.put(f"/api/v1/health-updates/{saved['id']}", json={"notes": "sprayed"})
    assert edited.json()["consentToTrain"] is True
    nulled = await api.put(f"/api/v1/health-updates/{saved['id']}", json={"consentToTrain": None})
    assert nulled.json()["consentToTrain"] is True
