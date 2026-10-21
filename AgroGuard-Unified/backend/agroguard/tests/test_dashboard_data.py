import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services import dashboard_data as dd


def test_prices_use_each_countrys_latest_year_and_skip_gaps():
    out = dd.asean_prices("Rice (Paddy)")
    names = {c["country"] for c in out["countries"]}
    assert {"Indonesia", "Thailand", "Viet Nam"} <= names
    # Cambodia's last rice price is older than the others: shown with its own year, not
    # carried forward to look current.
    cambodia = next(c for c in out["countries"] if c["country"] == "Cambodia")
    assert cambodia["year"] < out["asOf"]
    values = [c["usdPerTonne"] for c in out["countries"]]
    assert values == sorted(values, reverse=True)
    assert out["asOf"] == max(c["year"] for c in out["countries"])
    assert out["trend"][0]["year"] == 2000


def test_unknown_crop_is_empty_not_invented():
    out = dd.asean_prices("Moon cheese")
    assert out["countries"] == [] and out["trend"] == [] and out["asOf"] is None


def test_price_crops_are_listed_and_have_data():
    crops = dd.price_crops()
    assert "Rice (Paddy)" in crops
    assert all(len(dd.asean_prices(c)["countries"]) >= 3 for c in crops)


def test_myanmar_shares_exclude_crop_groups_and_add_up():
    out = dd.myanmar_crops()
    assert out["year"] and out["crops"]
    assert not any(dd.GROUP_ROW.search(c["crop"]) for c in out["crops"])
    total = sum(c["sharePercent"] for c in out["crops"]) + out["otherSharePercent"]
    assert abs(total - 100) < 0.3
    rice = next(c for c in out["crops"] if c["crop"] == "Rice")
    assert 1 < rice["yieldTPerHa"] < 10


@pytest.mark.asyncio
async def test_endpoint_has_no_demo_numbers_and_survives_mongo_being_down():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        response = await client.get("/api/v1/dashboard/stats", params={"crop": "Moon cheese"})
    assert response.status_code == 200
    body = response.json()
    assert body["prices"]["crop"] == body["priceCrops"][0]  # unknown crop falls back, not invented
    assert body["records"]["available"] in (True, False)
    assert "townships" not in body and "overview" not in body


def test_every_listed_price_crop_has_a_burmese_name():
    names = dd.crop_names_mm()
    assert [c for c in dd.price_crops() if c not in names] == []


def test_myanmar_crops_carry_a_burmese_name_where_one_is_known():
    crops = {c["crop"]: c for c in dd.myanmar_crops()["crops"]}
    assert crops["Rice"]["cropMm"] == dd.crop_names_mm()["Rice (Paddy)"]
    assert dd.crop_name_mm("Unlisted Crop") is None
