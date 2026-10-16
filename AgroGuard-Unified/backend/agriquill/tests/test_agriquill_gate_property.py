from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest

from agriquill import farmers, gates, safety, store
from agriquill.config import get_settings

WINDS = sorted({round(i * 0.05, 2) for i in range(201)} | {3.0, 3.01, 5.5, 5.51})
HOURS = 12
CONTRACT_GATES = ({**gates.DEFAULT_GATES}, {**gates.DEFAULT_GATES, "max_wind_ms": 9.0})


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


def _hourly(wind: float) -> dict[str, list]:
    return {
        "time": [f"2026-10-10T{h:02d}:00" for h in range(HOURS)],
        "temperature_2m": [30.0] * HOURS,
        "relative_humidity_2m": [65.0] * HOURS,
        "wet_bulb_temperature_2m": [25.0] * HOURS,
        "precipitation": [0.0] * HOURS,
        "wind_speed_10m": [wind] * HOURS,
    }


def _drone_task(wind: float) -> dict:
    humid = [farmers.WeatherDay(0.0, 24.0, 95.0, wind) for _ in range(4)]
    band = {"p10": [0] * 4, "p50": [1] * 4, "p90": [2] * 4}
    paddy = farmers.PaddyState(
        "PD-01", "rice_lowland", "Tillering", 40, 0.8, [1.0] * 20, [0.7] * 20
    )
    drone = farmers.Asset("D-01", "drone", "Drone", "standby")
    out = farmers.plan_operations([paddy], {"PD-01": band}, humid, [drone], date(2026, 10, 10))
    return next(t for t in out["tasks"] if t["agent"] == "drone_pilot")


def test_thresholds_are_the_documented_safety_values():
    settings = get_settings()
    assert settings.spray_wind_advisory_ms == 3.0
    assert settings.wind_ceiling_ms == 5.5


def test_every_spray_hour_above_the_spray_cap_is_blocked():
    cap = get_settings().spray_wind_advisory_ms
    for contract_gates in CONTRACT_GATES:
        for wind in WINDS:
            mask = gates.window_mask(_hourly(wind), "spray", contract_gates)
            for failure in mask[: HOURS - gates.WASHOUT_HOURS]:
                if wind > cap:
                    assert failure is not None and failure.startswith("wind:"), (wind, failure)
                else:
                    assert failure is None, (wind, failure)


def test_every_hour_above_the_hard_ceiling_blocks_all_flight_and_spray_work():
    ceiling = get_settings().wind_ceiling_ms
    for contract_gates in CONTRACT_GATES:
        for wind in WINDS:
            hourly = _hourly(wind)
            for kind in ("flight", "spray"):
                mask = gates.window_mask(hourly, kind, contract_gates)
                for failure in mask[: HOURS - gates.WASHOUT_HOURS]:
                    if wind > ceiling:
                        assert failure is not None and failure.startswith("wind:"), (kind, wind)
            verdict = safety.evaluate_actuation("drone", wind_speed_ms=wind)
            if wind > ceiling:
                assert verdict["status"] == "REJECTED"
                assert verdict["failure"]["code"] == "REJECTED_WIND_EXCEEDED"
            else:
                assert verdict["status"] == "PENDING_APPROVAL", wind


def test_drone_planner_never_sprays_and_grounds_above_the_ceiling():
    settings = get_settings()
    for wind in WINDS:
        task = _drone_task(wind)
        actuation = task["actuation"] or {}
        assert actuation.get("command") != "spray"
        if wind > settings.wind_ceiling_ms:
            assert task["blocked_reason"] == "REJECTED_WIND_EXCEEDED", wind
            assert task["actuation"] is None
        elif wind > settings.spray_wind_advisory_ms:
            assert "do not spray" in task["detail"], wind
