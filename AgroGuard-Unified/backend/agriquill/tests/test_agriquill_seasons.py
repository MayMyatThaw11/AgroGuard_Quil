from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest

from agriquill import seasons, store
from agriquill.config import get_settings
from agriquill.data import nasapower


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


KEYS = ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")
DELTA_RAIN = (0.26, 0.06, 0.46, 0.63, 2.61, 5.97, 7.18, 5.81, 3.83, 2.68, 0.59, 0.18)
DELTA_T = (25.77, 27.66, 30.02, 32.25, 30.78, 28.72, 27.86, 27.51, 27.62, 27.95, 27.36, 25.87)


def body(rain, temp, fill=-999.0):
    return {
        "properties": {
            "parameter": {
                "PRECTOTCORR": {**dict(zip(KEYS, rain, strict=True)), "ANN": 2.54},
                "T2M": {**dict(zip(KEYS, temp, strict=True)), "ANN": 28.28},
            }
        },
        "header": {"fill_value": fill, "range": "January 2001 - December 2025"},
    }


def normals(rain, temp):
    client = httpx.Client(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json=body(rain, temp)))
    )
    return nasapower.climatology(16.7, 95.6, client)


def test_climatology_turns_mm_per_day_into_monthly_totals():
    out = normals(DELTA_RAIN, DELTA_T)
    assert out["months"][5]["rain_mm"] == round(5.97 * 30, 1)
    assert out["months"][1]["rain_mm"] == round(0.06 * 28, 1)
    assert out["period"] == "January 2001 - December 2025"


def test_the_delta_has_a_rainy_hot_dry_and_cool_dry_season():
    cal = seasons.calendar(normals(DELTA_RAIN, DELTA_T))
    labels = [m["season"] for m in cal["months"]]
    assert labels[4:10] == ["rainy"] * 6
    assert labels[2:4] == ["hot_dry"] * 2
    assert labels[10:] + labels[:2] == ["cool_dry"] * 4
    assert [(r["season"], r["from"], r["to"]) for r in cal["runs"]] == [
        ("hot_dry", 3, 4),
        ("rainy", 5, 10),
        ("cool_dry", 11, 2),
    ]


def test_now_names_the_season_and_the_next_one():
    cal = seasons.calendar(normals(DELTA_RAIN, DELTA_T))
    now = seasons.now(cal, month=7)
    assert now["season"] == "rainy" and now["until_month"] == 10
    assert now["next"] == {"season": "cool_dry", "from": 11, "to": 2}


def test_an_equatorial_place_with_no_dry_month_is_wet_all_year():
    wet = (9.0, 6.0, 6.5, 8.0, 6.2, 5.0, 5.2, 5.0, 5.5, 6.0, 8.5, 10.0)
    cal = seasons.calendar(normals(wet, (27.0,) * 12))
    assert {m["season"] for m in cal["months"]} == {"rainy"}
    assert cal["wet_all_year"] is True and cal["wettest_months"] == [12, 1, 11]
    assert seasons.now(cal, month=3)["next"] is None


def test_a_southern_dry_season_comes_from_the_data_not_the_calendar():
    rain = (8.0, 8.0, 7.0, 5.0, 2.5, 1.0, 0.8, 0.6, 1.0, 3.0, 6.0, 8.0)
    temp = (27.0, 27.2, 27.5, 27.8, 27.0, 26.0, 25.5, 25.8, 26.5, 27.6, 27.8, 27.4)
    cal = seasons.calendar(normals(rain, temp))
    assert [m["season"] for m in cal["months"]][5:9] == ["cool_dry"] * 4


def test_the_route_serves_the_demo_farm_calendar_with_the_current_season(monkeypatch):
    from fastapi.testclient import TestClient

    from agriquill.api.main import create_app

    fixed = normals(DELTA_RAIN, DELTA_T)
    monkeypatch.setattr(nasapower, "climatology", lambda lat, lon, client=None: fixed)
    res = TestClient(create_app()).get("/api/v1/agriquill/contracts/farm_ayeyarwady_demo/seasons")
    assert res.status_code == 200, res.text
    data = res.json()
    assert len(data["months"]) == 12 and data["now"]["season"] in seasons.LABELS
    assert "Peel" in data["rule"]
    missing = TestClient(create_app()).get("/api/v1/agriquill/contracts/no_such_farm/seasons")
    assert missing.status_code == 404


def test_a_fill_value_or_an_outage_leaves_the_calendar_unknown_with_a_reason():
    rain = list(DELTA_RAIN)
    rain[6] = -999.0
    assert seasons.calendar(normals(rain, DELTA_T))["months"] is None

    def down(request):
        raise httpx.ConnectError("reset")

    out = nasapower.climatology(16.7, 95.6, httpx.Client(transport=httpx.MockTransport(down)))
    assert out["months"] is None and "unavailable" in out["missing"][0]["reason"]
    assert seasons.calendar(out)["reason"]
