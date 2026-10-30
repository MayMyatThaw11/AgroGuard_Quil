from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

from agriquill import cues, market, store, supply
from agriquill.config import get_settings

TODAY = date(2026, 11, 1)
READY = TODAY + timedelta(days=20)
HMAWBI = (17.10, 96.05)
TAIKKYI = (17.32, 95.97)
FAR = (21.97, 96.08)
BUYER = "ag:b1"


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    market.clear_cache()
    monkeypatch.setattr(market.prices, "trend", lambda *a, **k: {"field": "price"})
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def listing(
    farmer: str = "ag:7", at=HMAWBI, kg: int = 400, ask: int | None = 1500, **extra: Any
) -> dict[str, Any]:
    return market.post_listing(
        farmer,
        {
            "produce": "tomato",
            "qty_kg": kg,
            "ready_on": READY.isoformat(),
            "town": "Hmawbi" if at == HMAWBI else "Taikkyi",
            "lat": at[0],
            "lon": at[1],
            "ask_mmk_kg": ask,
            **extra,
        },
    )


def search(**kw: Any) -> dict[str, Any]:
    args = {"produce": "tomato", "lat": HMAWBI[0], "lon": HMAWBI[1], "radius_km": 50}
    return supply.supply(**{**args, **kw}, today=TODAY)


def rows(result: dict[str, Any]) -> list[dict[str, Any]]:
    return [r for g in result["groups"] for r in g["listings"]]


def test_supply_sorted_by_landed_low_not_distance() -> None:
    near = listing(at=HMAWBI, ask=2000)
    cheap = listing("ag:8", at=TAIKKYI, ask=1500)
    out = rows(search())
    assert [r["id"] for r in out] == [cheap["id"], near["id"]]
    assert out[0]["landed_low"] < out[1]["landed_low"]
    assert out[0]["landed_high"] >= out[0]["landed_low"]
    assert [g["town"] for g in search()["groups"]] == ["Taikkyi", "Hmawbi"]


def test_hidden_listing_not_returned() -> None:
    listing(visible_to_buyers=False)
    assert search()["groups"] == []


def test_ready_date_and_radius_are_respected() -> None:
    listing(at=HMAWBI)
    listing("ag:9", at=FAR)
    assert len(rows(search(by_date=READY - timedelta(days=1)))) == 0
    assert len(rows(search(by_date=READY))) == 1
    assert len(rows(search(radius_km=500))) == 1
    assert len(rows(search(radius_km=800))) == 2


def test_reference_price_labelled_when_no_ask(monkeypatch: pytest.MonkeyPatch) -> None:
    listing(ask=None)
    [row] = rows(search())
    assert (row["price_basis"], row["landed_low"]) == (None, None)
    monkeypatch.setattr(market.prices, "trend", lambda *a, **k: {"latest_mmk_kg": 1800})
    result = search()
    [row] = rows(result)
    assert row["price_basis"] == "reference" and row["landed_low"] > 1800
    assert result["reference_price"]["mmk_kg"] == 1800
    asked = listing("ag:8", ask=1500)
    by_id = {r["id"]: r for r in rows(search())}
    assert by_id[asked["id"]]["price_basis"] == "ask"


def test_slightly_over_budget_band_and_over_is_dropped() -> None:
    within = listing(ask=900)
    slightly = listing("ag:8", ask=1000)
    listing("ag:9", ask=1300)
    out = {r["id"]: r for r in rows(search(budget_mmk_kg=1000))}
    assert set(out) == {within["id"], slightly["id"]}
    assert out[within["id"]]["band"] == "within"
    assert out[slightly["id"]]["band"] == "slightly-over"
    ordered = [r["band"] for r in rows(search(budget_mmk_kg=1000))]
    assert ordered == ["within", "slightly-over"]


def test_supply_has_no_exact_points_or_owner() -> None:
    listing(producer_id=None)
    [row] = rows(search())
    assert not {"lat", "lon", "farmer", "producer_id"} & set(row)
    assert "ag:7" not in str(search())


def test_targeted_preorder_reaches_only_selected_farms() -> None:
    a = listing("ag:7")
    b = listing("ag:8", at=TAIKKYI)
    body = {
        "produce": "tomato",
        "qty_kg": 300,
        "needed_by": READY.isoformat(),
        "town": "Hmawbi",
        "lat": HMAWBI[0],
        "lon": HMAWBI[1],
        "target_listing_ids": [a["id"]],
    }
    pre = market.post_preorder(BUYER, "processor", body)
    assert [p["id"] for p in market.list_preorders(farmer="ag:7")] == [pre["id"]]
    assert market.list_preorders(farmer="ag:8") == []
    assert market.list_preorders() == []
    with pytest.raises(PermissionError):
        market.apply("ag:8", pre["id"], {"listing_id": b["id"], "qty_kg": 100})
    assert (
        market.apply("ag:7", pre["id"], {"listing_id": a["id"], "qty_kg": 100})["status"]
        == "candidate"
    )


def test_buyer_cue_capped_daily_and_needs_a_saved_search() -> None:
    assert cues.buyer_cues(BUYER, today=TODAY) == []
    listing(ask=900)
    supply.save_search(
        BUYER,
        {
            "produce": "tomato",
            "lat": HMAWBI[0],
            "lon": HMAWBI[1],
            "radius_km": 50,
            "budget_mmk_kg": 1200,
        },
    )
    first = cues.buyer_cues(BUYER, today=TODAY)
    assert [c["kind"] for c in first] == ["supply-match"]
    assert first[0]["params"]["n"] == 1 and first[0]["params"]["kg"] == 400
    assert cues.buyer_cues(BUYER, today=TODAY) == first
    assert cues.buyer_cues(BUYER, since=TODAY.isoformat(), today=TODAY) == []
    with pytest.raises(ValueError):
        supply.save_search(BUYER, {"produce": "tomato", "lat": 1, "lon": 1, "radius_km": 9999})
