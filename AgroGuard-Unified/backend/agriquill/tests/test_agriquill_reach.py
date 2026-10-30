from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest

from agriquill import market, reach, season_match, store
from agriquill.config import get_settings

TODAY = date(2026, 11, 1)
ON = date(2027, 3, 15)
HMAWBI = (17.10, 96.05)
TAIKKYI = (17.32, 95.97)
PYAY = (18.82, 95.22)
MANDALAY = (21.97, 96.08)


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


def listing(kg: int, produce: str = "potato", town: str = "Hmawbi", at=HMAWBI) -> None:
    market.post_listing(
        "ag:7",
        {
            "produce": produce,
            "qty_kg": kg,
            "ready_on": ON.isoformat(),
            "town": town,
            "lat": at[0],
            "lon": at[1],
        },
    )


def preorder(kind: str, at, town: str, produce: str = "potato", kg: int = 3000) -> None:
    market.post_preorder(
        f"ag:{kind}{town}",
        kind,
        {
            "produce": produce,
            "qty_kg": kg,
            "needed_by": ON.isoformat(),
            "town": town,
            "lat": at[0],
            "lon": at[1],
        },
    )


def advice(produce: str = "potato") -> dict:
    return market.outlook("Hmawbi", produce, ON.isoformat(), TODAY)


def test_reach_processors_when_no_local_buyers() -> None:
    listing(5000)
    preorder("processor", PYAY, "Pyay")
    season_match.post_order(
        "ag:r1",
        "restaurant",
        {
            "produce": "potato",
            "total_kg": 4000,
            "delivery_months": [3],
            "town": "Taikkyi",
            "lat": TAIKKYI[0],
            "lon": TAIKKYI[1],
            "grade": "any",
        },
    )
    out = advice()
    assert out["level"] == "no-buyers"
    found = next(a for a in out["advice"] if a["id"] == "reach-processors")
    assert found["params"]["n"] == 2 and found["params"]["km"] > 60
    assert "no_reach" not in out


def test_reach_excludes_households_and_beyond_300km() -> None:
    listing(5000)
    preorder("household", TAIKKYI, "Taikkyi", kg=20)
    preorder("processor", MANDALAY, "Mandalay")
    rows = reach.processors("potato", *HMAWBI, ON, TODAY)
    assert rows == []
    near = reach.processors("potato", *PYAY, ON, TODAY)
    assert near == []
    preorder("cooperative", PYAY, "Pyay")
    [row] = reach.processors("potato", *HMAWBI, ON, TODAY)
    assert row["buyer_kind"] == "cooperative" and 200 < row["road_km"] <= 300
    assert row["wants"]["kg"] == 3000 and row["source"] == "preorder"


def test_no_reach_gives_storage_or_alert_options_never_empty() -> None:
    listing(5000)
    out = advice()
    assert all(a["id"] != "reach-processors" for a in out["advice"])
    assert out["no_reach"]["options"] == ["storage", "list-anyway", "alert"]
    listing(5000, produce="tomato")
    assert advice("tomato")["no_reach"]["options"] == ["list-anyway", "alert"]


def test_season_orders_count_what_is_left_and_grade() -> None:
    order = season_match.post_order(
        "ag:r1",
        "processor",
        {
            "produce": "potato",
            "total_kg": 4000,
            "delivery_months": [3],
            "town": "Taikkyi",
            "lat": TAIKKYI[0],
            "lon": TAIKKYI[1],
            "grade": "sorted",
        },
    )
    [row] = reach.processors("potato", *HMAWBI, ON, TODAY)
    assert row["source"] == "season-order" and row["wants"]["grade"] == "sorted"
    assert row["wants"]["months"] == [3] and row["order_id"] == order["id"]


def test_processor_sees_surplus_towns() -> None:
    listing(9000, town="Hmawbi")
    preorder("household", HMAWBI, "Hmawbi", kg=1000)
    listing(500, town="Taikkyi", at=TAIKKYI)
    preorder("processor", TAIKKYI, "Taikkyi", kg=4000)
    rows = reach.surplus("potato", *TAIKKYI, ON, TODAY)
    assert [(r["town"], r["level"]) for r in rows] == [("Hmawbi", "glut")]
    assert rows[0]["supply_kg"] == 9000 and rows[0]["km"] < 60
