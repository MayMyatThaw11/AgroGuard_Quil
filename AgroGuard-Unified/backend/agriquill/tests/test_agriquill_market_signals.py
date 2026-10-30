from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

from agriquill import cropvalue, market, market_signals, producers, season_match, store
from agriquill.config import get_settings
from agriquill.data import fao_pack

TODAY = date(2026, 11, 1)
FARMER = "ag:1"
HMAWBI = (17.10, 96.05)


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path, settings.farm_market_towns
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.farm_market_towns = ""
    market.clear_cache()
    monkeypatch.setattr(market.prices, "trend", lambda *a, **k: {"field": "price"})
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path, settings.farm_market_towns = saved


def profile(**extra: Any) -> dict[str, Any]:
    body = {
        "kind": "household",
        "name": "Daw Hla's family",
        "lat": HMAWBI[0],
        "lon": HMAWBI[1],
        "township": "Hmawbi",
        "crops": [{"produce": "tomato", "area_ha": 0.5, "harvest_month": 3}],
        **extra,
    }
    return producers.create(FARMER, None, body)


def contract(monkeypatch: pytest.MonkeyPatch, tonnes: list[float] | None = None) -> None:
    spec = {
        "farm": {"country": "Myanmar"},
        "parcels": [
            {"id": "p1", "planted": "2026-07-01", "crop_id": "rice_lowland", "area_ha": 1.0}
        ],
    }
    monkeypatch.setattr(market_signals.live, "load", lambda farm_id: ("", {"contract": spec}))
    monkeypatch.setattr(
        cropvalue,
        "harvest_reference",
        lambda s: {"parcels": [{"parcel": "p1", "tonnes": tonnes, "area_ha": 1.0}]},
    )


def test_ready_on_prefers_season_plan_then_profile_month(monkeypatch: pytest.MonkeyPatch) -> None:
    plain = profile()
    out = market_signals.ready_on(plain, "tomato", TODAY)
    assert (out["date"], out["source"]) == ("2027-03-15", "profile-month")
    contract(monkeypatch)
    linked = producers.get(profile(lat=17.2, lon=96.2, contract_id="farm-1")["id"])
    out = market_signals.ready_on(linked, "tomato", TODAY)
    assert (out["date"], out["source"]) == (
        (date(2026, 7, 1) + timedelta(days=120)).isoformat(),
        "season-plan",
    )


def test_ready_on_degrades_when_nothing_is_known(monkeypatch: pytest.MonkeyPatch) -> None:
    record = producers.get(profile()["id"])
    assert market_signals.ready_on(record, "onion", TODAY)["field"] == "ready_on"
    monkeypatch.setattr(market_signals.live, "load", lambda farm_id: None)
    record = {**record, "contract_id": "gone"}
    assert market_signals.ready_on(record, "tomato", TODAY)["source"] == "profile-month"


def test_expected_kg_prefers_contract_reference_then_area_yield(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    record = producers.get(profile()["id"])
    typical = market_signals.expected_kg(record, "tomato")
    assert typical["kg"] == int(0.5 * market.yield_kg_ha("tomato"))
    assert typical["source"] == "typical-yield"
    year = date.today().year - 1
    conn, lock = fao_pack._db()
    with lock:
        conn.execute(
            "INSERT INTO qcl VALUES (28,'Myanmar',1,'Tomatoes','',1,'Yield',?,"
            "'kg/ha',20000.0,'A','')",
            (year,),
        )
        conn.execute("INSERT OR REPLACE INTO flags VALUES ('A','Official figure')")
        conn.execute(
            "INSERT OR REPLACE INTO meta VALUES ('faostat_packed_at','2026-10-29T00:00:00Z')"
        )
        conn.commit()
    official = market_signals.expected_kg(record, "tomato")
    assert (official["kg"], official["source"]) == (10000, "fao-official")
    contract(monkeypatch, [3.0, 5.0])
    linked = {
        **record,
        "contract_id": "farm-1",
        "crops": [{"produce": "rice", "area_ha": 1.0, "harvest_month": 11}],
    }
    assert market_signals.expected_kg(linked, "rice") == {"kg": 4000, "source": "national-range"}


def test_large_listing_gap_asks_not_blocks() -> None:
    assert market_signals.gap(5000, 2100) == {"expected_kg": 2100}
    assert market_signals.gap(900, 2100) == {"expected_kg": 2100}
    assert market_signals.gap(2500, 2100) is None
    assert market_signals.gap(2000, None) is None


def test_disease_high_routes_to_processor_hint() -> None:
    assert market_signals.grade_route("high") == {
        "grade_risk": "high",
        "channel_hint": "processor",
        "advice": "processor-for-grade",
    }
    assert market_signals.grade_route("moderate")["advice"] is None
    assert market_signals.grade_route(None)["grade_risk"] is None


def test_what_to_plant_requires_fit_and_demand(monkeypatch: pytest.MonkeyPatch) -> None:
    verdict = {
        "Solanum lycopersicum": "suitable",
        "Allium cepa": "contraindicated",
        "Capsicum annuum": "conditional",
        "Zea mays": "suitable",
    }
    monkeypatch.setattr(
        market_signals.ecocrop, "get", lambda name: name if name in verdict else None
    )
    monkeypatch.setattr(
        market_signals.ecocrop, "screen", lambda crop, site: {"verdict": verdict[crop]}
    )

    def order(produce: str, town: str = "Taikkyi") -> None:
        season_match.post_order(
            "ag:b1",
            "processor",
            {
                "produce": produce,
                "total_kg": 8000,
                "delivery_months": [3],
                "town": town,
                "lat": 17.3,
                "lon": 96.0,
            },
        )

    for produce in ("tomato", "onion", "maize"):
        order(produce)
    on = date(2027, 3, 15).isoformat()
    market.post_listing(
        "ag:7",
        {
            "produce": "maize",
            "qty_kg": 5000,
            "ready_on": on,
            "town": "Hmawbi",
            "lat": 17.1,
            "lon": 96.05,
        },
    )
    market.post_preorder(
        "ag:b2",
        "processor",
        {
            "produce": "maize",
            "qty_kg": 500,
            "needed_by": on,
            "town": "Hmawbi",
            "lat": 17.1,
            "lon": 96.05,
        },
    )
    rows = market_signals.what_to_plant({"mean_temp_c": 24}, 3, "Hmawbi", TODAY)
    assert [r["produce"] for r in rows] == ["tomato"]
    assert rows[0]["agronomy_fit"] == "suitable" and rows[0]["share"] == "part"
    assert rows[0]["demand_kg"] == 8000


def test_market_closed_outside_pilot_towns() -> None:
    assert market_signals.market_open("Anywhere") is True
    get_settings().farm_market_towns = "Hmawbi, Taikkyi"
    assert market_signals.market_open("hmawbi") is True
    assert market_signals.market_open("Yangon") is False
    assert market.outlook("Yangon", "tomato", "2027-03-15", TODAY)["market_open"] is False
    assert market.outlook("Hmawbi", "tomato", "2027-03-15", TODAY)["market_open"] is True
