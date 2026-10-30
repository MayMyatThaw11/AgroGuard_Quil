from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

from agriquill import haul, market, producers, season_match, store
from agriquill.config import get_settings

TODAY = date(2026, 11, 1)
MARCH = date(2027, 3, 15)
FARMER, STRANGER, BUYER = "ag:1", "ag:5", "ag:b1"
HMAWBI = (17.10, 96.05)
TAIKKYI = (17.32, 95.97)
NO_PRICE = {"field": "price", "reason": "offline"}


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    market.clear_cache()
    monkeypatch.setattr(market.prices, "trend", lambda *a, **k: NO_PRICE)
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def profile(owner: str = FARMER, **extra: Any) -> dict[str, Any]:
    body = {
        "kind": "household",
        "name": "Daw Hla's family",
        "lat": HMAWBI[0],
        "lon": HMAWBI[1],
        "township": "Hmawbi",
        "crops": [{"produce": "tomato", "area_ha": 0.5, "harvest_month": 3}],
        **extra,
    }
    return producers.create(owner, None, body)


def order(buyer: str = BUYER, **extra: Any) -> dict[str, Any]:
    body = {
        "produce": "tomato",
        "total_kg": 10_000,
        "delivery_months": [3],
        "town": "Taikkyi",
        "lat": TAIKKYI[0],
        "lon": TAIKKYI[1],
        "price": {"kind": "fixed", "mmk_kg": 1900},
        "grade": "any",
        "offers": [],
        "needs": [],
        **extra,
    }
    return season_match.post_order(buyer, "processor", body)


def only_match(producer_id: str, **kw: Any) -> dict[str, Any]:
    rows = season_match.matches(FARMER, producer_id, TODAY, **kw)
    assert len(rows) == 1
    return rows[0]


def ids(row: dict[str, Any]) -> list[str]:
    return [r["id"] for r in row["reasons"]]


def test_match_reasons_location_area_price_demand(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(market.prices, "trend", lambda *a, **k: {"latest_mmk_kg": 1800})
    market.post_listing(
        STRANGER,
        {
            "produce": "tomato",
            "qty_kg": 5000,
            "ready_on": MARCH.isoformat(),
            "town": "Hmawbi",
            "lat": HMAWBI[0],
            "lon": HMAWBI[1],
        },
    )
    market.post_preorder(
        "ag:b9",
        "processor",
        {
            "produce": "tomato",
            "qty_kg": 8000,
            "needed_by": MARCH.isoformat(),
            "town": "Taikkyi",
            "lat": TAIKKYI[0],
            "lon": TAIKKYI[1],
        },
    )
    pid = profile()["id"]
    order()
    row = only_match(pid)
    assert set(ids(row)) == {"location", "area", "price", "demand"}
    by_id = {r["id"]: r["params"] for r in row["reasons"]}
    assert 20 < by_id["location"]["km"] < 40
    assert by_id["price"]["pct"] == 6
    assert row["fit"] == "strong"


def test_price_reason_absent_without_rtfp_series() -> None:
    pid = profile()["id"]
    order()
    assert "price" not in ids(only_match(pid))


def test_group_profile_uses_member_area() -> None:
    record = profile(
        kind="group",
        crops=[{"produce": "tomato", "harvest_month": 3}],
        members=[{"name": "Ko A", "area_ha": 3.0}, {"name": "Ma B", "area_ha": 2.0}],
    )
    order()
    area = next(r for r in only_match(record["id"])["reasons"] if r["id"] == "area")
    assert area["params"]["kg"] == int(5.0 * market.YIELD_T_HA["tomato"] * 1000)


def test_needs_met_pairs() -> None:
    record = profile(wants=["cash-at-harvest", "pickup-needed"], can_offer=["weekly-delivery"])
    order(offers=["pays-within-3d"], needs=["weekly-supply", "sorted-grade"])
    met = {
        r["params"]["need"]: r["params"]["by"]
        for r in only_match(record["id"])["reasons"]
        if r["id"] == "needs-met"
    }
    assert met == {"cash-at-harvest": "pays-within-3d", "weekly-supply": "weekly-supply"}


@pytest.mark.parametrize(
    ("count", "word"),
    [(0, "weak"), (1, "weak"), (2, "good"), (3, "good"), (4, "strong"), (6, "strong")],
)
def test_fit_words(count: int, word: str) -> None:
    assert season_match.fit_word(count) == word


def test_matches_skip_other_produce_and_closed_lists_are_validated() -> None:
    pid = profile()["id"]
    order(produce="onion")
    assert season_match.matches(FARMER, pid, TODAY) == []
    with pytest.raises(ValueError):
        order(offers=["free-money"])
    with pytest.raises(ValueError):
        order(delivery_months=[13])
    with pytest.raises(PermissionError):
        season_match.matches(STRANGER, pid, TODAY)


def test_reserve_becomes_offer_in_delivery_month() -> None:
    pid = profile()["id"]
    so = order()
    with pytest.raises(PermissionError):
        season_match.reserve(STRANGER, pid, so["id"], 1000)
    with pytest.raises(ValueError):
        season_match.reserve(FARMER, pid, so["id"], 10_001)
    reserve = season_match.reserve(FARMER, pid, so["id"], 1000)
    assert reserve["status"] == "intent"
    assert season_match.activate(date(2027, 2, 28)) == 0
    assert market.offers() == []
    assert season_match.activate(date(2027, 3, 1)) == 1
    [offer] = market.offers()
    assert (offer["farmer"], offer["qty_kg"], offer["status"], offer["buyer"]) == (
        FARMER,
        1000,
        "candidate",
        BUYER,
    )
    assert season_match.activate(date(2027, 3, 2)) == 0
    assert len(market.offers()) == 1
    progress = season_match.mine(BUYER)[0]
    assert progress["reserved_kg"] == 1000 and progress["target_kg"] == 10_000
    assert progress["farmers"][0]["name"] == "Daw Hla's family"


def delivered(
    farmer: str, buyer: str, paid_in_days: int | None, needed_by: date, pid: str | None = None
):
    listing = market.post_listing(
        farmer,
        {
            "produce": "tomato",
            "qty_kg": 400,
            "ready_on": TODAY.isoformat(),
            "town": "Hmawbi",
            "lat": HMAWBI[0],
            "lon": HMAWBI[1],
            **({"producer_id": pid} if pid else {}),
        },
    )
    po = market.post_preorder(
        buyer,
        "processor",
        {
            "produce": "tomato",
            "qty_kg": 400,
            "needed_by": needed_by.isoformat(),
            "town": "Taikkyi",
            "lat": TAIKKYI[0],
            "lon": TAIKKYI[1],
        },
    )
    offer = market.apply(farmer, po["id"], {"listing_id": listing["id"], "qty_kg": 400})
    market.select(buyer, po["id"], offer["id"])
    haul.confirm_delivery(buyer, offer["id"], 400, 0)
    if paid_in_days is not None:
        season_match.mark_paid(
            farmer, offer["id"], (date.today() + timedelta(days=paid_in_days)).isoformat()
        )
    return offer


def test_buyer_reliability_days_to_pay_median() -> None:
    far = date.today() + timedelta(days=30)
    for days in (1, 3, 7):
        delivered(FARMER, BUYER, days, far)
    pending = market.post_preorder(
        BUYER,
        "processor",
        {
            "produce": "tomato",
            "qty_kg": 50,
            "needed_by": far.isoformat(),
            "town": "Taikkyi",
            "lat": TAIKKYI[0],
            "lon": TAIKKYI[1],
        },
    )
    listing = market.post_listing(
        FARMER,
        {
            "produce": "tomato",
            "qty_kg": 50,
            "ready_on": TODAY.isoformat(),
            "town": "Hmawbi",
            "lat": HMAWBI[0],
            "lon": HMAWBI[1],
        },
    )
    off = market.apply(FARMER, pending["id"], {"listing_id": listing["id"], "qty_kg": 50})
    market.select(BUYER, pending["id"], off["id"])
    rel = season_match.buyer_reliability(BUYER)
    assert (rel["orders"], rel["completed"], rel["median_days_to_pay"], rel["new"]) == (
        4,
        3,
        3,
        False,
    )


def test_new_buyer_has_no_record_not_zero() -> None:
    assert season_match.buyer_reliability("ag:new") == {
        "orders": 0,
        "completed": 0,
        "cancelled": 0,
        "median_days_to_pay": None,
        "new": True,
    }


def test_mark_paid_needs_delivery_and_the_farmer() -> None:
    far = date.today() + timedelta(days=30)
    offer = delivered(FARMER, BUYER, None, far)
    with pytest.raises(PermissionError):
        season_match.mark_paid(STRANGER, offer["id"], far.isoformat())
    listing = market.post_listing(
        FARMER,
        {
            "produce": "tomato",
            "qty_kg": 50,
            "ready_on": TODAY.isoformat(),
            "town": "Hmawbi",
            "lat": HMAWBI[0],
            "lon": HMAWBI[1],
        },
    )
    po = market.post_preorder(
        BUYER,
        "processor",
        {
            "produce": "tomato",
            "qty_kg": 50,
            "needed_by": far.isoformat(),
            "town": "Taikkyi",
            "lat": TAIKKYI[0],
            "lon": TAIKKYI[1],
        },
    )
    open_offer = market.apply(FARMER, po["id"], {"listing_id": listing["id"], "qty_kg": 50})
    with pytest.raises(ValueError):
        season_match.mark_paid(FARMER, open_offer["id"], far.isoformat())


def test_farmer_reliability_counts_on_time_only() -> None:
    pid = profile()["id"]
    delivered(FARMER, BUYER, None, date.today() + timedelta(days=5), pid)
    delivered(FARMER, BUYER, None, date.today() - timedelta(days=5), pid)
    assert season_match.farmer_reliability(pid) == {"delivered": 2, "on_time": 1}
    assert season_match.farmer_reliability(profile("ag:7", lat=18.0, lon=97.0)["id"]) == {
        "delivered": 0,
        "on_time": 0,
    }


def test_matches_carry_no_fare_fields() -> None:
    pid = profile()["id"]
    order(offers=["provides-pickup"])
    text = str(season_match.matches(FARMER, pid, TODAY)).lower()
    assert not any(word in text for word in ("fare", "transport", "landed", "per_km"))
