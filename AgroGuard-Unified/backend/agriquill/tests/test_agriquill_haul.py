from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path

import pytest

from agriquill import haul, market, store
from agriquill.config import get_settings

DAY = (date.today() + timedelta(days=20)).isoformat()


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    market.clear_cache()
    monkeypatch.setattr(haul, "_weather_day", lambda *a, **k: None)
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def listing(farmer: str, lat: float, lon: float, kg: int = 400) -> dict:
    return market.post_listing(
        farmer,
        {
            "produce": "tomato",
            "qty_kg": kg,
            "ready_on": DAY,
            "town": "Hmawbi",
            "lat": lat,
            "lon": lon,
        },
    )


def order(buyer: str = "ag:b1") -> dict:
    return market.post_preorder(
        buyer,
        "cooperative",
        {
            "produce": "tomato",
            "qty_kg": 2000,
            "needed_by": DAY,
            "town": "Hmawbi",
            "lat": 17.3,
            "lon": 96.3,
        },
    )


def selected(farmer: str, lat: float, lon: float, po: dict, kg: int = 400) -> dict:
    lst = listing(farmer, lat, lon, kg)
    offer = market.apply(farmer, po["id"], {"listing_id": lst["id"], "qty_kg": kg})
    return market.select(po["buyer"], po["id"], offer["id"])


@pytest.mark.parametrize(
    ("kg", "vehicle"),
    [
        (150, "motorbike trailer"),
        (151, "three-wheeler"),
        (501, "light truck"),
        (2001, "six-wheel truck"),
        (8000, "six-wheel truck"),
        (8001, None),
    ],
)
def test_vehicle_for_boundaries(kg: int, vehicle: str | None) -> None:
    assert haul.vehicle_for(kg) == vehicle


def test_freshness_tomato_over_window() -> None:
    near = haul.freshness("tomato", 30)
    far = haul.freshness("tomato", 900)
    assert near["ok"] and near["max_hours"] == 24
    assert not far["ok"] and far["hours"] > 24


def test_freshness_storable_is_always_ok() -> None:
    assert haul.freshness("onion", 2000)["ok"] is True


def test_pickup_window_hot_and_rain(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(haul, "_weather_day", lambda *a: {"noon_c": 34.0, "rain_mm": 2.0})
    assert haul.pickup_window(17.0, 96.0, DAY) == {"action": "pick-early", "before": "09:00"}
    monkeypatch.setattr(haul, "_weather_day", lambda *a: {"noon_c": 30.0, "rain_mm": 25.0})
    assert haul.pickup_window(17.0, 96.0, DAY) == {"action": "move-earlier", "before": None}
    monkeypatch.setattr(haul, "_weather_day", lambda *a: {"noon_c": 30.0, "rain_mm": 1.0})
    assert haul.pickup_window(17.0, 96.0, DAY) is None


def test_estimate_sorted_low_to_high() -> None:
    rows = haul.estimate((17.0, 96.0), (17.2, 96.2), 100, "tomato", DAY)
    lows = [r["low_mmk"] for r in rows]
    assert lows == sorted(lows)
    assert all(r["high_mmk"] > r["low_mmk"] for r in rows)
    assert all(r["low_per_kg"] < r["high_per_kg"] for r in rows)


def test_vehicle_that_cannot_carry_load_is_not_first() -> None:
    rows = haul.estimate((17.0, 96.0), (17.2, 96.2), 1500, "tomato", DAY)
    assert rows[0]["fits"] is True
    assert rows[0]["vehicle"] == "light truck"
    assert {r["vehicle"] for r in rows if not r["fits"]} == {
        "motorbike trailer",
        "three-wheeler",
    }
    assert rows[-1]["fits"] is False


def test_oversize_load_says_split() -> None:
    rows = haul.estimate((17.0, 96.0), (17.2, 96.2), 9000, "tomato", DAY)
    assert rows[0]["trips"] == 2
    assert rows[0]["vehicle"] == "six-wheel truck"


def test_rain_raises_high_only(monkeypatch: pytest.MonkeyPatch) -> None:
    dry = haul.estimate((17.0, 96.0), (17.2, 96.2), 300, "tomato", DAY)[0]
    monkeypatch.setattr(haul, "_weather_day", lambda *a: {"noon_c": 28.0, "rain_mm": 30.0})
    wet = haul.estimate((17.0, 96.0), (17.2, 96.2), 300, "tomato", DAY)[0]
    assert wet["low_mmk"] == dry["low_mmk"]
    assert wet["high_mmk"] > dry["high_mmk"]
    assert "rain-day" in wet["reasons"] and "empty-return" in wet["reasons"]


def test_terrain_flags_raise_high_with_reason() -> None:
    plain = haul.estimate((17.0, 96.0), (17.2, 96.2), 300, "tomato", DAY)[0]
    hill = haul.estimate((17.0, 96.0), (17.2, 96.2), 300, "tomato", DAY, terrain=("hill",))[0]
    assert hill["high_mmk"] > plain["high_mmk"] and hill["low_mmk"] == plain["low_mmk"]
    assert "hill-road" in hill["reasons"]


def test_rounded_point_widens_range() -> None:
    exact = haul.estimate((17.0, 96.0), (17.2, 96.2), 300, "tomato", DAY)[0]
    rounded = haul.estimate((17.0, 96.0), (17.2, 96.2), 300, "tomato", DAY, widen_km=1)[0]
    assert rounded["low_mmk"] <= exact["low_mmk"]
    assert rounded["high_mmk"] > exact["high_mmk"]


def test_light_truck_low_matches_task3_fare() -> None:
    km = 22.0
    row = next(
        r for r in haul.estimate_km(km, 1500, "tomato", None) if r["vehicle"] == "light truck"
    )
    assert row["low_mmk"] == haul.fare_mmk(km)


def test_pool_same_buyer_same_day_within_5km_splits_by_kg() -> None:
    po = order()
    a = selected("ag:1", 17.100, 96.100, po, 300)
    b = selected("ag:2", 17.110, 96.100, po, 600)
    pooled = haul.pool(a["id"])
    assert sorted(pooled["members"]) == sorted([a["id"], b["id"]])
    assert pooled["total_kg"] == 900
    assert pooled["vehicle"] == "light truck"
    assert pooled["fare_total"] == haul.estimate_km(pooled["km"], 900, "tomato", None)[0]["low_mmk"]
    assert pooled["share_mmk"][a["id"]] + pooled["share_mmk"][b["id"]] == pooled["fare_total"]
    assert pooled["share_mmk"][b["id"]] > pooled["share_mmk"][a["id"]]


def test_pool_excludes_far_farm_and_other_buyer() -> None:
    po = order()
    a = selected("ag:1", 17.100, 96.100, po)
    selected("ag:2", 17.300, 96.100, po)
    other = order("ag:b2")
    selected("ag:3", 17.101, 96.100, other)
    assert haul.pool(a["id"])["members"] == [a["id"]]


def test_farmer_trip_has_no_fare_fields() -> None:
    po = order()
    a = selected("ag:1", 17.100, 96.100, po, 300)
    selected("ag:2", 17.110, 96.100, po, 600)
    view = haul.trip("ag:1", a["id"])
    flat = repr(view)
    for banned in ("fare", "share_mmk", "low_mmk", "high_mmk", "per_kg", "tariff"):
        assert banned not in flat
    assert view["vehicle"] == "three-wheeler"
    assert view["pool"]["total_kg"] == 900
    assert view["freshness"]["max_hours"] == 24
    assert view["pack"] == "crates-not-sacks"


def test_trip_409_before_selection_and_403_for_others() -> None:
    po = order()
    lst = listing("ag:1", 17.1, 96.1)
    offer = market.apply("ag:1", po["id"], {"listing_id": lst["id"], "qty_kg": 400})
    with pytest.raises(haul.NotSelected):
        haul.trip("ag:1", offer["id"])
    market.select(po["buyer"], po["id"], offer["id"])
    with pytest.raises(PermissionError):
        haul.trip("ag:9", offer["id"])


def test_delivery_by_other_buyer_403() -> None:
    po = order()
    a = selected("ag:1", 17.1, 96.1, po)
    with pytest.raises(PermissionError):
        haul.confirm_delivery("ag:b2", a["id"], 400, 0)


def test_delivery_sets_listing_outcome_and_closes_offer() -> None:
    po = order()
    a = selected("ag:1", 17.1, 96.1, po)
    done = haul.confirm_delivery(po["buyer"], a["id"], 380, 20, "bruised")
    assert done["status"] == "delivered"
    assert done["received_kg"] == 380 and done["rejected_kg"] == 20
    lst = next(x for x in market.listings() if x["id"] == a["listing_id"])
    assert lst["outcome"] == "sold"
    seen = haul.trip("ag:1", a["id"])["delivery"]
    assert seen == {"received_kg": 380, "rejected_kg": 20, "reason": "bruised"}


def test_delivery_rejects_bad_weights_and_unselected() -> None:
    po = order()
    lst = listing("ag:1", 17.1, 96.1)
    offer = market.apply("ag:1", po["id"], {"listing_id": lst["id"], "qty_kg": 400})
    with pytest.raises(haul.NotSelected):
        haul.confirm_delivery(po["buyer"], offer["id"], 400, 0)
    market.select(po["buyer"], po["id"], offer["id"])
    with pytest.raises(ValueError, match="kg"):
        haul.confirm_delivery(po["buyer"], offer["id"], -1, 0)


def test_pool_ignores_already_delivered_trips() -> None:
    po = order()
    a = selected("ag:1", 17.100, 96.100, po, 300)
    b = selected("ag:2", 17.110, 96.100, po, 600)
    haul.confirm_delivery(po["buyer"], b["id"], 600, 0)
    assert haul.pool(a["id"])["members"] == [a["id"]]
