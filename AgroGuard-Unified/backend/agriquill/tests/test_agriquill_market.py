from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path

import pytest

from agriquill import market, store
from agriquill.config import get_settings

TODAY = date(2026, 11, 1)
ON = TODAY + timedelta(days=20)
HMAWBI = (17.10, 96.05)
TAIKKYI = (17.32, 95.97)


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    market.clear_cache()
    monkeypatch.setattr(
        market.prices, "trend", lambda *a, **k: {"field": "price", "reason": "offline in tests"}
    )
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def listing(
    kg: int,
    town: str = "Hmawbi",
    at: tuple[float, float] = HMAWBI,
    ready: date = ON,
    produce: str = "tomato",
    **extra,
):
    return market.post_listing(
        "farmer-a",
        {
            "produce": produce,
            "qty_kg": kg,
            "ready_on": ready.isoformat(),
            "town": town,
            "lat": at[0],
            "lon": at[1],
            **extra,
        },
    )


def preorder(
    kg: int,
    kind: str = "processor",
    town: str = "Hmawbi",
    at: tuple[float, float] = HMAWBI,
    need: date = ON,
    buyer: str = "buyer-a",
    produce: str = "tomato",
    verified: bool = True,
):
    record = market.post_preorder(
        buyer,
        kind,
        {
            "produce": produce,
            "qty_kg": kg,
            "needed_by": need.isoformat(),
            "town": town,
            "lat": at[0],
            "lon": at[1],
        },
    )
    if verified:
        market.mark_buyer_verified(buyer)
    return record


def outlook(town: str = "Hmawbi", produce: str = "tomato"):
    return market.outlook(town, produce, ON.isoformat(), today=TODAY)


@pytest.mark.parametrize(
    ("supply", "demand", "level"),
    [(100, 0, "no-buyers"), (70, 100, "short"), (100, 100, "balanced"), (200, 100, "glut")],
)
def test_outlook_levels(supply: int, demand: int, level: str) -> None:
    listing(supply)
    if demand:
        preorder(demand)
    assert outlook()["level"] == level


def test_window_excludes_far_dates() -> None:
    listing(500, ready=ON + timedelta(days=30))
    listing(100)
    assert outlook()["supply_kg"] == 100


def test_channel_from_buyer_kind() -> None:
    assert preorder(10, kind="processor")["channel"] == "bulk"
    assert preorder(10, kind="household")["channel"] == "direct"


def test_select_by_other_buyer_raises() -> None:
    own = listing(100)
    order = preorder(100, buyer="buyer-a")
    offer = market.apply("farmer-a", order["id"], {"listing_id": own["id"], "qty_kg": 100})
    with pytest.raises(PermissionError):
        market.select("buyer-b", order["id"], offer["id"])
    assert market.select("buyer-a", order["id"], offer["id"])["status"] == "selected"


def test_advice_presell_and_nearby() -> None:
    for _ in range(12):
        listing(300)
    for i in range(3):
        preorder(200, buyer=f"b{i}")
    preorder(5000, town="Taikkyi", at=TAIKKYI, buyer="far")
    listing(100, town="Taikkyi", at=TAIKKYI)
    result = outlook()
    assert result["level"] == "glut"
    ids = {a["id"] for a in result["advice"]}
    assert {"presell-bulk", "try-nearby"} <= ids
    near = next(a for a in result["advice"] if a["id"] == "try-nearby")
    assert near["params"]["town"] == "Taikkyi"
    assert near["params"]["unmet_kg"] == 4900


def test_tomato_outlook_without_price() -> None:
    listing(100)
    result = outlook()
    assert result["level"] == "no-buyers"
    assert result["price"]["field"] == "price"


@pytest.mark.parametrize(
    ("listings", "buyers", "label"),
    [(9, 3, "early"), (10, 3, "some"), (31, 3, "good"), (12, 2, "early")],
)
def test_coverage_labels(listings: int, buyers: int, label: str) -> None:
    for _ in range(listings):
        listing(10)
    for i in range(buyers):
        preorder(10, buyer=f"b{i}")
    assert outlook()["coverage"]["label"] == label


def test_early_coverage_softens_verdict_copy_id() -> None:
    listing(500)
    preorder(100)
    assert outlook()["verdict"] == "early-glut"


def test_listing_capped_at_area_yield_x1_5() -> None:
    record = listing(1_000_000, area_ha=1.0)
    cap = int(market.YIELD_T_HA["tomato"] * 1000 * 1.5)
    assert record["counted_kg"] == cap
    assert outlook()["supply_kg"] == cap


def test_unverified_buyer_counts_half() -> None:
    listing(100)
    preorder(100, verified=False)
    assert outlook()["demand_kg"] == 50


def test_try_nearby_stops_when_unmet_reaches_zero() -> None:
    for _ in range(3):
        listing(500)
    preorder(100)
    preorder(300, town="Taikkyi", at=TAIKKYI, buyer="far")
    listing(300, town="Taikkyi", at=TAIKKYI)
    assert "try-nearby" not in {a["id"] for a in outlook()["advice"]}


def test_plant_other_is_partial() -> None:
    for _ in range(3):
        listing(500, ready=TODAY + timedelta(days=80))
    preorder(100, need=TODAY + timedelta(days=80))
    result = market.outlook(
        "Hmawbi", "tomato", (TODAY + timedelta(days=80)).isoformat(), today=TODAY
    )
    plant = next(a for a in result["advice"] if a["id"] == "plant-other")
    assert plant["params"]["share"] == "part"


def test_listing_write_purges_outlook() -> None:
    listing(100)
    assert outlook()["supply_kg"] == 100
    listing(50)
    assert outlook()["supply_kg"] == 150


def test_bad_listing_is_rejected() -> None:
    with pytest.raises(ValueError):
        listing(0)
    with pytest.raises(ValueError):
        listing(10, produce="spaceship")


def test_outlook_cache_is_per_day_not_per_week() -> None:
    monday, saturday = date(2026, 11, 16), date(2026, 11, 21)
    assert monday.isocalendar()[1] == saturday.isocalendar()[1]
    listing(100, ready=saturday + timedelta(days=13))
    assert market.outlook("Hmawbi", "tomato", saturday.isoformat(), today=TODAY)["supply_kg"] == 100
    assert market.outlook("Hmawbi", "tomato", monday.isoformat(), today=TODAY)["supply_kg"] == 0


@pytest.mark.parametrize("kind", ["factory", "msme"])
def test_factories_and_msmes_buy_in_bulk(kind: str) -> None:
    assert market.channel_for(kind) == "bulk"


def test_demo_seed_runs_once_and_shows_a_glut_and_a_short_town() -> None:
    assert market.seed_demo() > 0
    assert market.seed_demo() == 0
    ready = (date.today() + timedelta(days=21)).isoformat()
    glut = market.outlook("Nyaungshwe", "tomato", ready)
    assert glut["level"] == "glut"
    near = next(a for a in glut["advice"] if a["id"] == "try-nearby")
    assert near["params"]["town"] == "Taunggyi"
    assert market.outlook("Aungban", "potato", ready)["level"] == "short"
    kinds = {p["buyer_kind"] for p in market.preorders() if p["town"] == "Aungban"}
    assert {"factory", "processor"} <= kinds


def test_demo_reseed_replaces_old_demo_rows_and_keeps_real_ones() -> None:
    real = listing(123, town="Nyaungshwe", at=(20.66, 96.935))
    market.post_listing(
        "old-demo",
        {
            "produce": "tomato",
            "qty_kg": 99999,
            "ready_on": ON.isoformat(),
            "town": "Nyaungshwe",
            "lat": 20.66,
            "lon": 96.935,
            "demo": True,
        },
    )
    market.seed_demo()
    ids = {x["id"] for x in market.listings()}
    assert real["id"] in ids
    assert not any(x["qty_kg"] == 99999 for x in market.listings())


def test_towns_balance_lists_towns_with_data_and_their_centre() -> None:
    listing(5000)
    preorder(1000)
    listing(300, town="Taikkyi", at=TAIKKYI)
    rows = {r["town"]: r for r in market.towns_balance("tomato", ON.isoformat(), TODAY)}
    assert set(rows) == {"Hmawbi", "Taikkyi"}
    assert rows["Hmawbi"]["level"] == "glut" and rows["Hmawbi"]["supply_kg"] == 5000
    assert rows["Taikkyi"]["level"] == "no-buyers"
    assert rows["Hmawbi"]["lat"] == pytest.approx(HMAWBI[0], abs=0.01)
    assert market.towns_balance("onion", ON.isoformat(), TODAY) == []
    with pytest.raises(ValueError):
        market.towns_balance("gold", ON.isoformat(), TODAY)
