from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

from agriquill import cues, haul, market, producers, season_match, store
from agriquill.config import get_settings

FARMER, STRANGER, BUYER = "ag:1", "ag:5", "ag:b1"
HMAWBI = (17.10, 96.05)
TAIKKYI = (17.32, 95.97)


def utc_today() -> date:
    return date.fromisoformat(store.now_iso()[:10])


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


def profile(month: int, owner: str = FARMER, **extra: Any) -> dict[str, Any]:
    body = {
        "kind": "household",
        "name": "Daw Hla's family",
        "lat": HMAWBI[0],
        "lon": HMAWBI[1],
        "township": "Hmawbi",
        "crops": [{"produce": "tomato", "area_ha": 0.5, "harvest_month": month}],
        **extra,
    }
    return producers.create(owner, None, body)


def new_preorder() -> None:
    market.post_preorder(
        BUYER,
        "processor",
        {
            "produce": "tomato",
            "qty_kg": 2000,
            "needed_by": (utc_today() + timedelta(days=30)).isoformat(),
            "town": "Taikkyi",
            "lat": TAIKKYI[0],
            "lon": TAIKKYI[1],
        },
    )


def test_cues_capped_one_per_day_and_repeat_is_suppressed() -> None:
    today = utc_today()
    soon = today + timedelta(days=10)
    pid = profile(soon.month)["id"]
    new_preorder()
    first = cues.cues(FARMER, pid, today=today)
    assert [c["kind"] for c in first] == ["harvest-soon"]
    assert cues.cues(FARMER, pid, today=today) == first
    tomorrow = cues.cues(FARMER, pid, today=today + timedelta(days=1))
    assert [c["kind"] for c in tomorrow] == ["new-buyers"]
    assert tomorrow[0]["params"]["n"] == 1


def test_harvest_soon_cue_21_days_before_month() -> None:
    pid = profile(3)["id"]
    assert cues.cues(FARMER, pid, today=date(2027, 2, 7)) == []
    [cue] = cues.cues(FARMER, pid, today=date(2027, 2, 8))
    assert cue["kind"] == "harvest-soon" and cue["params"]["days"] == 21
    assert cue["params"]["produce"] == "tomato"


def test_cues_require_can_act_and_since_filters_old_ones() -> None:
    today = utc_today()
    pid = profile((today + timedelta(days=5)).month)["id"]
    with pytest.raises(PermissionError):
        cues.cues(STRANGER, pid, today=today)
    assert (
        len(cues.cues(FARMER, pid, since=(today - timedelta(days=1)).isoformat(), today=today)) == 1
    )
    assert cues.cues(FARMER, pid, since=today.isoformat(), today=today) == []


def test_glut_at_planting_cue() -> None:
    today = utc_today()
    ahead = today + timedelta(days=100)
    on = date(ahead.year, ahead.month, 15)
    pid = profile(ahead.month)["id"]
    market.post_listing(
        "ag:7",
        {
            "produce": "tomato",
            "qty_kg": 9000,
            "ready_on": on.isoformat(),
            "town": "Hmawbi",
            "lat": HMAWBI[0],
            "lon": HMAWBI[1],
        },
    )
    market.post_preorder(
        "ag:b2",
        "household",
        {
            "produce": "tomato",
            "qty_kg": 1000,
            "needed_by": on.isoformat(),
            "town": "Hmawbi",
            "lat": HMAWBI[0],
            "lon": HMAWBI[1],
        },
    )
    assert [c["kind"] for c in cues.cues(FARMER, pid, today=today)] == ["new-buyers"]
    [cue] = cues.cues(FARMER, pid, today=today + timedelta(days=1))
    assert cue["kind"] == "glut-at-planting" and cue["params"]["town"] == "Hmawbi"


def delivered(producer_id: str, kg: int, price: int, received: int) -> None:
    listing = market.post_listing(
        FARMER,
        {
            "produce": "tomato",
            "qty_kg": kg,
            "ready_on": utc_today().isoformat(),
            "town": "Hmawbi",
            "lat": HMAWBI[0],
            "lon": HMAWBI[1],
            "producer_id": producer_id,
        },
    )
    po = market.post_preorder(
        BUYER,
        "processor",
        {
            "produce": "tomato",
            "qty_kg": kg,
            "needed_by": (utc_today() + timedelta(days=9)).isoformat(),
            "town": "Taikkyi",
            "lat": TAIKKYI[0],
            "lon": TAIKKYI[1],
            "price_offer_mmk_kg": price,
        },
    )
    offer = market.apply(FARMER, po["id"], {"listing_id": listing["id"], "qty_kg": kg})
    market.select(BUYER, po["id"], offer["id"])
    haul.confirm_delivery(BUYER, offer["id"], received, 0)


def test_season_vs_town_price(monkeypatch: pytest.MonkeyPatch) -> None:
    pid = profile(3)["id"]
    empty = season_match.season_record(FARMER, pid)
    assert (empty["sold_kg"], empty["avg_mmk_kg"], empty["deliveries"]) == (0, None, 0)
    monkeypatch.setattr(market.prices, "trend", lambda *a, **k: {"latest_mmk_kg": 1850})
    delivered(pid, 1000, 1900, 1000)
    delivered(pid, 3000, 1950, 2000)
    rec = season_match.season_record(FARMER, pid)
    assert rec["sold_kg"] == 3000 and rec["deliveries"] == 2 and rec["on_time"] == 2
    assert rec["avg_mmk_kg"] == round((1000 * 1900 + 2000 * 1950) / 3000)
    assert rec["town_avg_mmk_kg"] == 1850
    with pytest.raises(PermissionError):
        season_match.season_record(STRANGER, pid)
