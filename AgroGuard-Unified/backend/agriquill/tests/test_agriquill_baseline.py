from collections.abc import Iterator
from datetime import date
from pathlib import Path

import httpx
import pytest

from agriquill import baseline, market, store
from agriquill.config import get_settings
from agriquill.data import fao_pack

TODAY = date(2026, 10, 30)
DATA = Path(__file__).parent / "data"
RICE = "Rice"
CHILI = "Chillies and peppers, dry (Capsicum spp., Pimenta spp.), raw"


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    market.clear_cache()
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def pack(rows: list[tuple[str, int, float, str]], area: int = 28) -> None:
    conn, lock = fao_pack._db()
    with lock:
        conn.executemany(
            "INSERT INTO qcl VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [
                (area, "Myanmar", 1, item, "", 5412, "Yield", year, "kg/ha", value, flag, "")
                for item, year, value, flag in rows
            ],
        )
        conn.executemany(
            "INSERT OR REPLACE INTO flags VALUES (?, ?)",
            [
                ("A", "Official figure"),
                ("E", "Estimated value"),
                ("I", "Value imputed by a receiving agency"),
            ],
        )
        conn.executemany(
            "INSERT OR REPLACE INTO meta VALUES (?, ?)",
            [
                ("faostat_packed_at", "2026-10-29T00:00:00Z"),
                ("faostat_url", "fixture://faostat"),
                ("faostat_sha256", "sha256:fixture"),
            ],
        )
        conn.commit()


def sync_calendar() -> None:
    body = (DATA / "crop_calendar_mm.json").read_bytes()
    client = httpx.Client(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, content=body))
    )
    fao_pack.REQUEST_GAP_S = 0
    fao_pack.sync_crop_calendar(["MMR"], client=client)


def test_imputed_value_not_used_in_calculation() -> None:
    pack([(CHILI, 2022, 1365.7, "I"), (CHILI, 2023, 1383.0, "E")])
    out = baseline.official_yield("MMR", "chili", TODAY)
    assert out["field"] == "yield" and "kg_ha" not in out
    assert out["context"]["flag"] == "E" and out["context"]["note"] == "Estimated value"
    assert market.counted_kg("chili", 10_000_000, 2.0) == int(
        2.0 * market.YIELD_T_HA["chili"] * 1000 * 1.5
    )


def test_official_value_latest_within_5_years() -> None:
    pack(
        [
            (RICE, 2018, 3000.0, "A"),
            (RICE, 2021, 3895.7, "A"),
            (RICE, 2022, 3946.7, "A"),
            (RICE, 2023, 3981.8, "E"),
        ]
    )
    out = baseline.official_yield("Myanmar", "rice", TODAY)
    assert (out["kg_ha"], out["year"], out["flag"]) == (3946.7, 2022, "A")
    assert out["provenance"] == "OFFICIAL_RECORD" and out["source"]["url"] == "fixture://faostat"


def test_official_value_older_than_5_years_is_missing() -> None:
    pack([(RICE, 2018, 3000.0, "A")])
    assert "kg_ha" not in baseline.official_yield("MMR", "rice", TODAY)


def test_myanmar_tomato_missing() -> None:
    pack([(RICE, 2022, 3946.7, "A")])
    out = baseline.official_yield("MMR", "tomato", TODAY)
    assert out["field"] == "yield" and "kg_ha" not in out


def test_nothing_packed_is_missing_not_an_error() -> None:
    assert baseline.official_yield("MMR", "rice", TODAY)["field"] == "yield"


def test_calendar_missing_when_not_synced() -> None:
    out = baseline.season_months("MMR", "rice")
    assert out["field"] == "season" and "not synced" in out["reason"]


def test_season_months_from_calendar() -> None:
    sync_calendar()
    every = baseline.season_months("MMR", "rice")
    assert every["plant"] == [6, 7, 8, 11, 12] and len(every["aez"]) == 2
    out = baseline.season_months("MMR", "rice", aez="Bago")
    assert out["plant"] == [6, 7, 11, 12]
    assert out["harvest"] == [3, 4, 10, 11, 12]
    assert out["provenance"] == "OFFICIAL_RECORD" and out["source"]["url"]
    assert baseline.season_months("MMR", "maize")["plant"] == [5, 6]
    assert baseline.season_months("MMR", "tomato")["field"] == "season"


def test_market_cap_uses_official_yield_when_present() -> None:
    year = date.today().year - 1
    pack([(RICE, year, 3946.7, "A")])
    assert market.counted_kg("rice", 10_000_000, 2.0) == int(2.0 * 3946.7 * 1.5)


def test_outlook_carries_baseline_block() -> None:
    year = date.today().year - 1
    pack([(RICE, year, 3946.7, "A")])
    out = market.outlook("Hmawbi", "rice", TODAY.isoformat(), today=TODAY)
    assert out["baseline"]["yield"]["kg_ha"] == 3946.7
    assert out["baseline"]["season"]["field"] == "season"
