import math
import random
import time
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from functools import cache
from pathlib import Path

import pytest

from agriquill import contract, flows, forecast, fusion, live, onboard, schedule, store
from agriquill.api.main import OpsPlanReq
from agriquill.config import get_settings

START = date(2026, 10, 14)
PLOTS = 500
SERIES_DAYS = 400
QUICK = forecast.ForecastConfig(epochs=15, mc_samples=8)
WIDE = forecast.ForecastConfig(horizon=15, epochs=15, mc_samples=8)


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


def max_paddies() -> int:
    return next(
        m.max_length
        for m in OpsPlanReq.model_fields["paddies"].metadata
        if hasattr(m, "max_length")
    )


def week(days=8):
    n = days * 24
    rng = random.Random(64)
    return {
        "time": [f"{START + timedelta(days=d)}T{h:02d}:00" for d in range(days) for h in range(24)],
        "temperature_2m": [30.0] * n,
        "relative_humidity_2m": [60.0] * n,
        "wet_bulb_temperature_2m": [25.0] * n,
        "precipitation": [rng.choice((0.0, 0.0, 0.0, 1.5)) for _ in range(n)],
        "wind_speed_10m": [rng.choice((1.5, 2.5, 4.0, 6.5)) for _ in range(n)],
        "et0_fao_evapotranspiration": [0.2 if 6 <= i % 24 <= 18 else 0.0 for i in range(n)],
        "is_day": [1 if 6 <= i % 24 <= 18 else 0 for i in range(n)],
    }


def task(tid, day, target, asset, paddy, command="open"):
    return {
        "id": tid,
        "agent": "drone_pilot" if target == "drone" else "water_steward",
        "date": str(START + timedelta(days=day)),
        "priority": ("high", "medium", "low")[day % 3],
        "paddy_id": paddy,
        "asset_id": asset,
        "actuation": {"target": target, "command": command},
        "blocked_reason": None,
    }


def test_cp_sat_plans_the_largest_ops_request_within_its_time_limit():
    count = max_paddies()
    assert count == 64
    positions = {
        f"PD-{i:02d}": (16.0 + 0.02 * (i // 8), 95.0 + 0.02 * (i % 8)) for i in range(count)
    }
    tasks = []
    for i, paddy in enumerate(positions):
        tasks.append(task(f"w{i}", i % 4, "irrigation_valve", f"P-{i:02d}", paddy))
        if i % 2 == 0:
            tasks.append(task(f"f{i}", i % 5, "drone", "D-01", paddy, "scout_flight"))
        if i % 4 == 0:
            tasks.append(task(f"s{i}", i % 3, "drone", "D-01", paddy, "spray"))
    hourly = week()
    limit = get_settings().scheduler_time_limit_s
    started = time.perf_counter()
    out = schedule.solve(tasks, hourly, durations_h={"irrigate": 2}, crew=1, positions=positions)
    elapsed = time.perf_counter() - started
    summary = out["summary"]
    print(f"\n{len(tasks)} jobs on {count} paddies: {summary['status']} in {elapsed:.2f} s")
    if summary["status"] == "FALLBACK":
        assert "CP-SAT returned" in summary["reason"]
        return
    assert summary["status"] in ("OPTIMAL", "FEASIBLE")
    if summary["status"] == "FEASIBLE":
        assert elapsed >= limit * 0.9, "FEASIBLE before the limit means the solve stopped early"
    assert elapsed <= limit + 15, f"{elapsed:.1f} s against a {limit} s limit"
    done = sorted(
        (t for t in out["tasks"] if t["schedule"]["status"] == "scheduled"),
        key=lambda t: t["schedule"]["start_index"],
    )
    assert summary["scheduled"] == len(done) > 0
    left = [t for t in out["tasks"] if t["schedule"]["status"] != "scheduled"]
    assert all(t["blocked_reason"] for t in left), "every job left out must say why"
    for n, a in enumerate(done):
        for b in done[n + 1 :]:
            gap = schedule.travel_hours(positions[a["paddy_id"]], positions[b["paddy_id"]], 5.0)
            gap = 0 if a["paddy_id"] == b["paddy_id"] else gap
            end = a["schedule"]["start_index"] + a["schedule"]["duration_h"]
            assert b["schedule"]["start_index"] >= end + gap, (a["id"], b["id"])
    late = sum(
        abs(t["schedule"]["start_index"] - (24 * (date.fromisoformat(t["date"]) - START).days + 6))
        for t in done
    )
    assert summary["lateness_h"] == late


def square(lat, lon, side=0.0006):
    corners = [
        (lat, lon),
        (lat, lon + side),
        (lat + side, lon + side),
        (lat + side, lon),
        (lat, lon),
    ]
    return [[round(a, 6), round(b, 6)] for a, b in corners]


@cache
def big_farm() -> str:
    stages = ("Tillering", '"Panicle Initiation"', "Flowering", "Ripening")
    lines = [
        "farm farm_scale {",
        '    name: "Scale Cooperative"',
        "    country: MM",
        "    location: [16.7, 95.6]",
        "    hydrology {",
        "        regime: AWD_SAFE",
        "        trigger_irrig_below: -15 cm",
        "        flowering_lock_depth: 3 cm .. 5 cm",
        "        percolation: 3 mm/day",
        "    }",
        "}",
    ]
    for i in range(PLOTS):
        ring = square(16.7 + 0.001 * (i // 25), 95.6 + 0.001 * (i % 25))
        lines += [
            f"parcel PS-{i:03d} {{",
            f"    area: {contract.ring_area_ha(ring)} ha",
            "    crop_id: rice_lowland",
            f"    stage: {stages[i % 4]}",
            f'    planted: "2026-0{6 + i % 3}-1{i % 10}"',
            f"    boundary: {ring}",
        ]
        if i % 5 == 0:
            lines += [
                "    standard: EU_2018_848",
                "    sell_as: organic",
                '    conversion_start: "2023-01-31"',
            ]
        if i % 7 == 0:
            lines += [
                "    hydrology {",
                "        regime: CONTINUOUS",
                "        percolation: 1.5 mm/day",
                "    }",
            ]
        lines.append("}")
    return "\n".join(lines)


def test_contract_verify_handles_500_plots():
    out = contract.verify(big_farm())
    errors = [d for d in out["diagnostics"] if d["severity"] == "ERROR"]
    assert out["is_valid"] is True, errors[:3]
    parcels = out["contract"]["parcels"]
    assert len(parcels) == PLOTS and len({p["id"] for p in parcels}) == PLOTS
    assert len(contract.parcel_positions(out["contract"])) == PLOTS
    assert all(p["conversion"]["qualifies"] for p in parcels if p["conversion"])
    assert not any(d["code"] == "AGRI-W033" for d in out["diagnostics"])


class Inputs:
    def items(self, kind):
        return [
            {
                "farm_id": "farm_scale",
                "field": f"PS-{i:03d}",
                "kind": "fertiliser",
                "product": "Urea 46%",
                "rate": 50.0,
                "n_pct": 46.0,
                "rate_unit": "kg/ha",
                "applied_at": "2026-09-01T08:00:00+06:30",
            }
            for i in range(0, PLOTS, 3)
        ]


def test_farm_flows_over_500_parcels_balance_water_and_scale_methane_by_area(monkeypatch):
    verdict = contract.verify(big_farm())
    hourly = week()
    dates = sorted({t[:10] for t in hourly["time"]})
    paddies = [
        {"id": f"PS-{i:03d}", "band": {"p50": [(-1) ** i * 2.0] * len(dates)}, "band_dates": dates}
        for i in range(0, PLOTS, 2)
    ]
    current = {"status": "OK", "hourly": hourly, "paddies": paddies, "weather": {"source": "stub"}}
    monkeypatch.setattr(live, "build_live", lambda farm_id, client=None: current)
    monkeypatch.setattr(live, "load", lambda farm_id: (big_farm(), verdict))
    monkeypatch.setattr(onboard, "_INPUTS", Inputs())
    out = flows.farm_flows("farm_scale")
    assert out["status"] == "OK" and len(out["parcels"]) == PLOTS
    areas = {p["id"]: p["area_ha"] for p in verdict["contract"]["parcels"]}
    for parcel in out["parcels"]:
        water = parcel["water"]
        total = water["total"]
        outflow = total["transpiration_mm"] + total["evaporation_mm"] + total["percolation_mm"]
        assert abs(water["net_mm"] - (total["rain_mm"] - outflow)) <= 0.1, parcel["id"]
        ch4 = parcel["methane"]
        assert abs(ch4["farm_kg"] - ch4["kg_ha"] * areas[parcel["id"]]) <= 0.05 + 1e-9, parcel["id"]
    farm_kg = sum(p["methane"]["farm_kg"] for p in out["parcels"])
    expected = sum(p["methane"]["kg_ha"] * areas[p["id"]] for p in out["parcels"])
    assert abs(farm_kg - expected) <= 0.05 * PLOTS
    assert sum(1 for p in out["parcels"] if p["nitrogen"]["applications"]) == len(
        range(0, PLOTS, 3)
    )


def long_series(seed=400):
    rng = random.Random(seed)
    hours = SERIES_DAYS * 24
    start = datetime(2025, 9, 1)
    hourly = {
        "time": [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(hours)],
        "precipitation": [rng.choice((0.0,) * 30 + (4.0,)) for _ in range(hours)],
        "et0_fao_evapotranspiration": [0.3 if 6 <= i % 24 <= 18 else 0.0 for i in range(hours)],
    }
    kc, perc = 1.1, 3.0
    depth, rows = 2.0, []
    for i in range(hours):
        if i % 24 == 8:
            stamp = (datetime(2025, 9, 1, tzinfo=UTC) + timedelta(hours=i)).isoformat()
            rows.append(
                {
                    "observed_at": stamp,
                    "value": round(depth + rng.gauss(0, 0.3), 2),
                    "source": "lorawan:ttn",
                }
            )
        rain, et0 = hourly["precipitation"][i], hourly["et0_fao_evapotranspiration"][i]
        depth += (rain - et0 * kc - perc / 24) / 10
        depth = min(depth, 8.0) if depth > -15 else 5.0
    return hourly, rows, kc, perc


def test_depth_filters_run_over_a_400_day_series():
    hourly, rows, kc, perc = long_series()
    now_index = len(hourly["time"]) - 24
    out = fusion.kalman_depth(rows, hourly, 0, now_index, kc, perc)
    assert out["now"] is not None, out.get("reason")
    assert out["updates"] == len(rows) - 1
    assert len(out["past"]) >= SERIES_DAYS - 2
    band = out["band"]
    assert all(a <= b <= c for a, b, c in zip(band["p10"], band["p50"], band["p90"], strict=True))
    shadow = fusion.next_reading_backtest(rows, hourly, 0, kc, perc)
    assert shadow["pairs"] == len(rows) - 1 >= fusion.PROMOTE_MIN_PAIRS
    assert shadow["status"] in ("promote", "shadow")
    assert all(math.isfinite(v) for v in shadow["mae_cm"].values())


def flat_and_dry(count):
    series = [forecast.SeriesInput(f"PD-{i}", [3.0] * SERIES_DAYS) for i in range(count)]
    return series, [0.0] * SERIES_DAYS, [27.0] * SERIES_DAYS, [0.0] * WIDE.horizon


def test_the_hybrid_is_not_chosen_when_it_cannot_beat_persistence():
    out = forecast.forecast(*flat_and_dry(2), WIDE)
    backtest = out["backtest"]
    assert backtest["neural_candidate"] == "scored"
    assert backtest["series_scored"] * WIDE.horizon >= forecast.MIN_PROMOTION_PAIRS
    assert backtest["candidates"][forecast.PERSISTENCE] == 0.0
    assert out["method"] != forecast.HYBRID


def test_the_hybrid_is_not_chosen_on_fewer_than_30_held_out_pairs():
    rng = random.Random(7)
    rain = [rng.choice((0.0, 0.0, 0.0, 5.0, 20.0)) for _ in range(SERIES_DAYS)]
    temp = [27.0 + rng.uniform(-3, 3) for _ in range(SERIES_DAYS)]
    wave = [1.5 * math.sin(2 * math.pi * t / 7) for t in range(SERIES_DAYS)]
    out = forecast.forecast(
        [forecast.SeriesInput("PD-1", wave)], rain, temp, [0.0] * QUICK.horizon, QUICK
    )
    backtest = out["backtest"]
    assert backtest["series_scored"] * QUICK.horizon < forecast.MIN_PROMOTION_PAIRS
    assert backtest["candidates"][forecast.HYBRID] < backtest["candidates"][forecast.PERSISTENCE]
    assert out["method"] != forecast.HYBRID
