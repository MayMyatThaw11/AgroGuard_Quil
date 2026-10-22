import csv
import io
import json
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from agriquill import cropvalue, forecast, ml, modelcard, rehearse, store, telemetry
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.data import weather

client = TestClient(create_app())
FARM = "farm_ayeyarwady_demo"
URL = f"/api/v1/agriquill/contracts/{FARM}/model-card"
FAO_SOURCE = {"provider": "FAOSTAT QCL (test pack)", "sha256": "sha256:test"}


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


def _hours(start: date, days: int) -> list[str]:
    first = datetime(start.year, start.month, start.day)
    return [(first + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(days * 24)]


def open_meteo() -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        params = request.url.params
        leads = [k for k in params.get("hourly", "").split(",") if "previous_day" in k]
        if "start_date" in params:
            start = date.fromisoformat(params["start_date"])
            days = (date.fromisoformat(params["end_date"]) - start).days + 1
        else:
            past = int(params["past_days"])
            start = datetime.now(UTC).date() - timedelta(days=past)
            days = past + int(params["forecast_days"])
        times = _hours(start, days)
        n = len(times)
        if leads:
            body = {"hourly": {"time": times, **{k: [0.1] * n for k in leads}}}
            return httpx.Response(200, content=json.dumps(body).encode())
        body = {
            "timezone": "GMT",
            "utc_offset_seconds": 0,
            "hourly_units": {
                "temperature_2m": "°C",
                "precipitation": "mm",
                "wind_speed_10m": "m/s",
            },
            "hourly": {
                "time": times,
                "temperature_2m": [30.0] * n,
                "relative_humidity_2m": [65.0] * n,
                "wet_bulb_temperature_2m": [25.0] * n,
                "precipitation": [0.1] * n,
                "wind_speed_10m": [2.0] * n,
                "wind_gusts_10m": [3.0] * n,
                "et0_fao_evapotranspiration": [0.3 if 6 <= i % 24 <= 18 else 0.0 for i in range(n)],
                "is_day": [1 if 6 <= i % 24 <= 18 else 0 for i in range(n)],
            },
        }
        return httpx.Response(200, content=json.dumps(body).encode())

    return httpx.Client(transport=httpx.MockTransport(handler))


def fao_rice(iso3, item, element=None, *args, **kwargs):
    rows = [
        {
            "area": "Myanmar",
            "item": "Rice",
            "item_code": 27,
            "element": "Yield",
            "year": year,
            "value": 3800.0 + 20 * (year % 3),
            "unit": "kg/ha",
            "flag": "A",
            "flag_meaning": "Official figure",
        }
        for year in range(2005, 2025)
    ]
    return {"records": rows, "missing": [], "source": FAO_SOURCE}


@pytest.fixture(autouse=True)
def offline(monkeypatch: pytest.MonkeyPatch) -> None:
    hourly, archive, issued = (
        weather.fetch_hourly,
        weather.fetch_archive_hourly,
        weather.issued_rain,
    )
    monkeypatch.setattr(
        weather,
        "fetch_hourly",
        lambda lat, lon, past=14, ahead=8, client=None: hourly(lat, lon, past, ahead, open_meteo()),
    )
    monkeypatch.setattr(
        weather,
        "fetch_archive_hourly",
        lambda lat, lon, start, end, client=None: archive(lat, lon, start, end, open_meteo()),
    )
    monkeypatch.setattr(
        weather,
        "issued_rain",
        lambda lat, lon, cut, horizon, client=None: issued(lat, lon, cut, horizon, open_meteo()),
    )
    monkeypatch.setattr(cropvalue.fao_pack, "faostat_qcl", fao_rice)


def log_days(device: str, days: int = modelcard.HISTORY_DAYS) -> None:
    today = datetime.now(UTC).replace(hour=12, minute=0, second=0, microsecond=0)
    for k in range(days, 0, -1):
        stamp = (today - timedelta(days=k)).isoformat(timespec="seconds")
        value = round(5.0 - 0.3 * (days - k), 2)
        telemetry.ingest(device, stamp, {"water_depth_cm": value}, "manual", "tester")


def rows_named(card: dict, model: str) -> list[dict]:
    return [r for r in card["rows"] if r["model"] == model]


def test_every_row_names_its_baseline_source_and_a_reason_when_null():
    res = client.get(URL)
    assert res.status_code == 200
    card = res.json()
    for row in card["rows"]:
        assert set(modelcard.COLUMNS) <= row.keys()
        assert row["baseline"] and row["source"] and row["predicts"] and row["metric"]
        assert row["status"] in modelcard.STATUSES
        if row["value"] is None:
            assert row["reason"], row
    models = {r["model"] for r in card["rows"]}
    assert {
        "depth-forecast",
        "B-TS-2 quantile heads",
        "B-TS-3 split conformal",
        "B-TS-5 augmented filter",
        "B-TS-6 changepoints",
        "water-balance next reading",
        "rehearsed decisions",
        "national yield persistence",
        "B-ML-1 crop classifier",
    } <= models


def test_a_farm_without_tube_history_gets_nulls_with_reasons_not_numbers():
    card = client.get(URL).json()
    depth = rows_named(card, "depth-forecast")[0]
    assert depth["value"] is None and "days in a row" in depth["reason"]
    filters = rows_named(card, "B-TS-5 augmented filter")
    assert len(filters) == 7 and all(r["value"] is None for r in filters)
    assert "PD-01-tube" in filters[0]["reason"]
    assert rows_named(card, "water-balance next reading")[0]["value"] is None
    decided = rows_named(card, "rehearsed decisions")[0]
    assert decided["value"] is None and decided["pairs"] == 0
    assert decided["model_status"] == rehearse.STATUS


def test_b_ml_1_stays_null_with_the_reason_from_ml():
    row = rows_named(client.get(URL).json(), "B-ML-1 crop classifier")[0]
    assert row["value"] is None and row["status"] == "not run"
    assert row["reason"] == ml.VALIDATION["reason"]


def test_the_yield_row_copies_the_persistence_check():
    rows = rows_named(client.get(URL).json(), "national yield persistence")
    assert len(rows) == 1
    check = cropvalue.yieldcast.persistence_check(
        {r["year"]: r["value"] for r in fao_rice("MMR", "Rice")["records"]}
    )
    assert check is not None
    assert rows[0]["value"] == check["within_10"] and rows[0]["pairs"] == check["n"]
    assert rows[0]["mape_pct"] == check["mape_pct"] and rows[0]["data"] == FAO_SOURCE


def test_with_two_months_of_tube_readings_the_backtests_fill_in():
    log_days("PD-01-tube")
    log_days("PD-02-tube")
    card = client.get(URL).json()
    depth = rows_named(card, "depth-forecast")[0]
    assert depth["value"] is not None and depth["baseline_value"] is not None
    assert depth["paddies"] == ["PD-01", "PD-02"]
    assert depth["pairs"] == 2 * forecast.ForecastConfig().horizon
    assert depth["rain_basis"] == "forecast issued at the cut"
    assert depth["issued_rain"]["source"] == "Open-Meteo Previous Runs API"
    rolling = rows_named(card, "depth-forecast-rolling")[0]
    assert rolling["pairs"] > depth["pairs"] and rolling["value"] is not None
    heads = rows_named(card, "B-TS-2 quantile heads")[0]
    assert heads["value"] is None and "neural candidate" in heads["reason"]
    conformal = rows_named(card, "B-TS-3 split conformal")[0]
    assert conformal["status"] in ("shadow", "rule met, still in shadow")
    pd01 = next(
        r for r in rows_named(card, "B-TS-5 augmented filter") if r["predicts"].endswith("PD-01")
    )
    assert pd01["value"] is not None and pd01["pairs"] >= 1
    assert pd01["priors"]["status"] == "TO VERIFY"
    onboard_row = rows_named(card, "water-balance next reading")[0]
    assert onboard_row["value"] is not None and onboard_row["baseline_value"] is not None


def test_csv_holds_the_same_table():
    card = client.get(URL).json()
    res = client.get(URL, params={"format": "csv"})
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
    table = list(csv.reader(io.StringIO(res.text)))
    assert tuple(table[0]) == modelcard.COLUMNS
    assert [r[0] for r in table[1:]] == [r["model"] for r in card["rows"]]


def test_unknown_farm_is_404():
    assert client.get("/api/v1/agriquill/contracts/no_such_farm/model-card").status_code == 404
