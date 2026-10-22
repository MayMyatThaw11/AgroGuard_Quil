import base64
import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from agriquill import fusion, live, store, telemetry
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.mcp import server

client = TestClient(create_app())
FARM = "farm_ayeyarwady_demo"


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


def hourly(hours=48, et0=0.0, rain=0.0):
    start = datetime(2026, 10, 1)
    return {
        "time": [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(hours)],
        "precipitation": [rain] * hours,
        "et0_fao_evapotranspiration": [et0] * hours,
    }


def row(hour, value, source="lorawan:ttn"):
    stamp = (datetime(2026, 10, 1, tzinfo=UTC) + timedelta(hours=hour)).isoformat()
    return {"observed_at": stamp, "value": value, "source": source}


def test_filter_follows_the_water_balance_between_readings():
    out = fusion.kalman_depth([row(0, 0.0)], hourly(et0=0.0), 0, 24, 1.0, 24.0)
    assert out["now"] == pytest.approx(-2.4)
    assert out["band"]["p10"][0] < out["band"]["p50"][0] < out["band"]["p90"][0]
    assert out["sigma_cm"] > 0


def test_reading_pulls_estimate_and_shrinks_uncertainty():
    model_only = fusion.kalman_depth([row(0, 0.0)], hourly(), 0, 24, 1.0, 24.0)
    fused = fusion.kalman_depth([row(0, 0.0), row(23, -2.0)], hourly(), 0, 24, 1.0, 24.0)
    assert abs(fused["now"] - -2.0) < abs(model_only["now"] - -2.0) + 0.5
    assert fused["sigma_cm"] < model_only["sigma_cm"]
    assert fused["flags"] == []


def test_one_forged_jump_moves_the_estimate_under_2_cm_and_stays_flagged():
    model_only = fusion.kalman_depth([row(0, 0.0)], hourly(), 0, 24, 1.0, 0.0)
    forged = fusion.kalman_depth([row(0, 0.0), row(10, 20.0)], hourly(), 0, 24, 1.0, 0.0)
    assert abs(forged["now"] - model_only["now"]) < 2.0
    assert forged["flags"][0]["kind"] == "unmodelled_inflow"
    assert forged["flags"][0]["status"] == "unconfirmed"


def test_two_agreeing_readings_accept_a_real_irrigation():
    out = fusion.kalman_depth(
        [row(0, -10.0), row(10, 4.0), row(12, 4.1)], hourly(), 0, 24, 1.0, 0.0
    )
    assert out["now"] == pytest.approx(4.1, abs=0.5)
    assert out["flags"][0]["status"] == "confirmed"


def test_a_jump_contradicted_by_the_next_reading_is_unknown_not_guessed():
    out = fusion.kalman_depth([row(0, 0.0), row(10, 20.0), row(12, 0.1)], hourly(), 0, 24, 1.0, 0.0)
    assert out["now"] is None
    assert "conflicting readings" in out["reason"]
    assert out["flags"][0]["status"] == "conflicting"


def test_a_lone_bund_breach_raises_a_flag_not_silence():
    out = fusion.kalman_depth([row(0, 0.0), row(5, -12.0)], hourly(), 0, 24, 1.0, 0.0)
    assert out["flags"][0]["kind"] == "fast_drawdown"
    assert out["flags"][0]["status"] == "unconfirmed"
    assert out["now"] is not None


def test_missing_weather_hour_is_reported():
    h = hourly()
    h["et0_fao_evapotranspiration"][3] = None
    out = fusion.kalman_depth([row(0, 0.0)], h, 0, 24, 1.0, 0.0)
    assert out["now"] is None and "lacks rain or ET0" in out["reason"]


def test_sensor_health_detects_stuck_and_stale():
    base = datetime.now(UTC) - timedelta(hours=20)
    for i in range(6):
        telemetry.ingest(
            "t1", (base + timedelta(hours=i)).isoformat(), {"water_depth_cm": -3.0}, "lorawan:ttn"
        )
    telemetry.ingest(
        "t1", (base + timedelta(hours=7)).isoformat(), {"battery_v": 3.4}, "lorawan:ttn"
    )
    health = telemetry.health("t1", "water_depth_cm")
    assert health["status"] == "attention"
    assert any(i.startswith("stuck") for i in health["issues"])
    assert any(i.startswith("stale") for i in health["issues"])
    assert health["battery_v"] == 3.4


def test_photo_evidence_is_hashed_and_linked():
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    now = (datetime.now(UTC) - timedelta(minutes=1)).isoformat(timespec="seconds")
    body = {
        "device_id": "PD-02-tube",
        "observed_at": now,
        "values": {"water_depth_cm": -9},
        "reporter": "Ko Min",
        "photo_base64": base64.b64encode(png).decode(),
    }
    r = client.post("/api/v1/agriquill/telemetry/readings", json=body)
    assert r.status_code == 200
    assert r.json()["stored"][0]["evidence"].startswith("sha256:")
    bad = client.post(
        "/api/v1/agriquill/telemetry/readings",
        json={**body, "photo_base64": base64.b64encode(b"GIF89a").decode()},
    )
    assert bad.status_code == 422


def _weather(wind=2.0):
    start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0, hour=0) - timedelta(
        days=14
    )
    n = 22 * 24
    return {
        "timezone": "GMT",
        "utc_offset_seconds": 0,
        "hourly_units": {"temperature_2m": "°C", "precipitation": "mm", "wind_speed_10m": "m/s"},
        "hourly": {
            "time": [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(n)],
            "temperature_2m": [30.0] * n,
            "relative_humidity_2m": [65.0] * n,
            "wet_bulb_temperature_2m": [25.0] * n,
            "precipitation": [0.0] * n,
            "wind_speed_10m": [wind] * n,
            "wind_gusts_10m": [wind] * n,
            "et0_fao_evapotranspiration": [0.2] * n,
            "is_day": [1 if 6 <= i % 24 <= 18 else 0 for i in range(n)],
        },
    }


def mock():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=json.dumps(_weather()).encode())

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_onsite_wind_overrides_forecast_when_stricter():
    now = (datetime.now(UTC) - timedelta(minutes=5)).isoformat(timespec="seconds")
    telemetry.ingest("ws-01", now, {"wind_ms": 6.4}, "lorawan:ttn")
    out = live.build_live(FARM, mock())
    assert out["onsite_wind"]["used"] is True
    assert out["hourly"]["wind_speed_10m"][0] == 6.4
    assert out["weather"]["days"][0]["wind_ms"] == 6.4


def test_monitoring_reports_every_layer_honestly():
    now = (datetime.now(UTC) - timedelta(hours=1)).isoformat(timespec="seconds")
    telemetry.ingest("PD-02-tube", now, {"water_depth_cm": -9.0}, "manual", "Ko Min")
    out = live.monitoring(FARM, mock())
    pd02 = next(p for p in out["paddies"] if p["id"] == "PD-02")
    assert pd02["scout"]["reporter"] == "Ko Min"
    assert pd02["model"]["depth_cm"] is not None and pd02["model"]["sigma_cm"] > 0
    band = pd02["model"]["band"]
    assert band["p50"] and len(band["p10"]) == len(band["p50"]) == len(band["p90"])
    triples = zip(band["p10"], band["p50"], band["p90"], strict=True)
    assert all(lo <= mid <= hi for lo, mid, hi in triples)
    assert len(pd02["model"]["band_dates"]) == len(band["p50"])
    assert len(pd02["model"]["series_dates"]) == len(pd02["model"]["series"])
    assert all(p["model"] is None for p in out["paddies"] if p["id"] != "PD-02")
    assert pd02["satellite"]["status"] == "not_connected"
    assert out["coverage"]["model"] == 1 and out["coverage"]["unknown"] == 6
    assert "field_monitoring_status" in server.select_tools(False)


def test_summary_for_buyers_uses_only_recorded_facts():
    out = live.summary(FARM, mock())
    assert out["contract"]["valid"] is True
    assert out["contract"]["parcels"] == 7 and out["contract"]["area_ha"] == 5.78
    assert out["contract"]["to_verify"] >= 3
    assert out["monitoring"]["paddies"] == 7
    assert out["ledger"]["valid"] is True
    assert set(out["proposals"]) == {"open", "approved", "rejected"}


def test_fault_flag_becomes_an_inspection_proposal():
    base = datetime.now(UTC) - timedelta(hours=6)
    telemetry.ingest("PD-02-tube", base.isoformat(), {"water_depth_cm": 0.0}, "lorawan:ttn")
    telemetry.ingest(
        "PD-02-tube",
        (base + timedelta(hours=2)).isoformat(),
        {"water_depth_cm": -14.0},
        "lorawan:ttn",
    )
    out = live.watch(FARM, mock())
    texts = [p["text"] for p in out["proposals"]]
    assert any(t.startswith("Inspect PD-02") for t in texts)


def test_conflicting_readings_still_raise_an_inspection_proposal():
    base = datetime.now(UTC) - timedelta(hours=8)
    for hours, value in ((0, 0.0), (2, 20.0), (4, 0.1)):
        telemetry.ingest(
            "PD-02-tube",
            (base + timedelta(hours=hours)).isoformat(),
            {"water_depth_cm": value},
            "lorawan:ttn",
        )
    status = live.monitoring(FARM, mock())
    pd02 = next(p for p in status["paddies"] if p["id"] == "PD-02")
    assert pd02["model"] is None
    assert any("conflicting readings" in m["reason"] for m in pd02["missing"])
    out = live.watch(FARM, mock())
    assert any(p["text"].startswith("Inspect PD-02") for p in out["proposals"])
