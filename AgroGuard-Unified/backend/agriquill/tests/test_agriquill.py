import time

from fastapi.testclient import TestClient

from agriquill import dsl, safety, sim
from agriquill.api.main import create_app
from agriquill.ledger import Ledger
from agriquill.mcp import tools

client = TestClient(create_app())


def test_dsl_lint_blocks_synthetic_urea_under_asoa():
    code = (
        'parcel field_01 { area: 2 ha standard: "ASOA_ORGANIC_V2" }\n'
        "management { day 10: apply_fertilizer { material: synthetic_urea rate: 50 kg/ha } }"
    )
    out = dsl.lint(code)
    assert out["is_valid"] is False
    assert any(d["code"] == "AGRI-E010" and d["severity"] == "ERROR" for d in out["diagnostics"])


def test_dsl_lint_passes_organic_input():
    code = 'standard: "ASOA_ORGANIC_V2"\nmaterial: AzollaBioCompost'
    out = dsl.lint(code)
    assert out["is_valid"] is True


def test_drone_guard_rejects_wind_exceeding_ceiling():
    result = tools.drone_spray_guard(5.6)
    assert result["status"] == "REJECTED_WIND_EXCEEDED"
    assert result["permitted"] is False


def test_evaluate_actuation_drone_wind_halt_beats_compliance():
    verdict = safety.evaluate_actuation(
        "drone",
        wind_speed_ms=9.9,
        declared_inputs=["synthetic_urea"],
        standard="ASEAN_ORGANIC_ASOA",
        approval_pin="1234",
        operator_confirmed=True,
    )
    assert verdict["status"] == "REJECTED"
    assert verdict["failure"]["code"] == "REJECTED_WIND_EXCEEDED"


def test_sim_runs_120_days_and_biomass_is_monotonic_nonnegative():
    started = time.perf_counter()
    out = sim.simulate(parcel_id="MM-AYY-2026-001", days=120)
    elapsed_ms = (time.perf_counter() - started) * 1000
    biomass = out["biomass_trajectory"]
    assert len(biomass) == 120
    assert all(b >= 0 for b in biomass)
    assert all(biomass[i] <= biomass[i + 1] + 1e-9 for i in range(len(biomass) - 1))
    assert elapsed_ms < 250, f"sim took {elapsed_ms:.1f} ms (design target 250 ms)"


def test_ledger_chain_verifies_and_detects_tampering():
    ledger = Ledger(None)
    ledger.append("a", {"x": 1})
    ledger.append("b", {"y": 2})
    assert ledger.verify() is True
    # Tamper by rebuilding a ledger with a mutated payload but the original
    # stored hash: re-verification must fail because the hash no longer matches.
    from agriquill.ledger import LedgerEntry

    tampered = Ledger(None)
    entries = [LedgerEntry(**e) for e in ledger.entries()]
    entries[0].payload["x"] = 999
    tampered._entries = entries
    assert tampered.verify() is False


def test_api_lint_endpoint():
    code = 'standard: "ASOA_ORGANIC_V2"\nmaterial: synthetic_urea'
    r = client.post("/api/v1/agriquill/dsl/lint", json={"script_content": code})
    assert r.status_code == 200
    assert r.json()["is_valid"] is False


def test_api_sim_run_and_status():
    r = client.post("/api/v1/agriquill/sim/run", json={"parcel_id": "P1", "simulation_days": 120})
    assert r.status_code == 202
    job = r.json()
    assert job["status"] == "COMPLETED"
    s = client.get(job["check_status_url"])
    assert s.status_code == 200
    assert s.json()["result"]["simulation_days"] == 120


def test_api_actuation_drone_high_wind_rejected():
    r = client.post(
        "/api/v1/agriquill/actuation/approve",
        json={
            "target": "drone",
            "wind_speed_ms": 6.5,
            "declared_inputs": [],
            "parcel_standard": "ASEAN_ORGANIC_ASOA",
            "approval_pin": "1234",
            "operator_confirmed": True,
        },
    )
    assert r.status_code == 200
    assert r.json()["status"] == "REJECTED"
    assert r.json()["failure"]["code"] == "REJECTED_WIND_EXCEEDED"


def test_api_actuation_valve_duration_clamp():
    r = client.post(
        "/api/v1/agriquill/actuation/approve",
        json={
            "target": "irrigation_valve",
            "declared_inputs": [],
            "parcel_standard": "ASEAN_ORGANIC_ASOA",
            "approval_pin": "1234",
            "operator_confirmed": True,
            "requested_minutes": 200,
        },
    )
    assert r.json()["status"] == "REJECTED"
    assert r.json()["failure"]["code"] == "REJECTED_DURATION_EXCEEDED"


def test_api_actuation_missing_approval_is_pending():
    r = client.post(
        "/api/v1/agriquill/actuation/approve",
        json={
            "target": "drone",
            "wind_speed_ms": 2.0,
            "declared_inputs": [],
            "parcel_standard": "ASEAN_ORGANIC_ASOA",
            "operator_confirmed": False,
        },
    )
    assert r.json()["status"] == "PENDING_APPROVAL"


def test_ml_crop_predict_and_plant_recommend():
    r1 = client.post(
        "/api/v1/agriquill/ml/crop-predict",
        json={"soil_ph": 6.5, "rainfall_mm": 900, "temperature_c": 25.0},
    )
    assert r1.status_code == 200
    body = r1.json()
    assert isinstance(body["crop"], str) and body["crop"]
    assert 0 <= body["confidence_percent"] <= 100
    assert body["validation"]["held_out_accuracy"] is None
    assert body["validation"]["validated_on_field_data"] is False
    retired = {"accuracy_design_target", "heldout_accuracy_on_bundled_synthetic_dataset"}
    assert not retired & set(body)
    r2 = client.post(
        "/api/v1/agriquill/ml/plant-recommend",
        json={"soil_ph": 6.5, "rainfall_mm": 900, "temperature_c": 25.0, "limit": 3},
    )
    assert r2.status_code == 200
    assert len(r2.json()["recommendations"]) <= 3


def test_ml_rejects_out_of_range_inputs():
    r = client.post(
        "/api/v1/agriquill/ml/crop-predict",
        json={"soil_ph": 99.0, "rainfall_mm": 900, "temperature_c": 25.0},
    )
    assert r.status_code == 422


def test_territory_profile_shape_or_graceful_502():
    r = client.get("/api/v1/agriquill/territory-profile", params={"lat": 16.9825, "lon": 95.8812})
    # Upstream may be unavailable; the route must never crash and must either
    # return the contract or a typed 502.
    assert r.status_code in (200, 502)
    if r.status_code == 200:
        body = r.json()
        soil_profile = body["soil_profile"]
        if soil_profile["provider"] == "unavailable":
            assert soil_profile["layers"] == [] and soil_profile["missing"]
        else:
            assert len(soil_profile["layers"]) == 6
        assert body["weather_forecast"]["forecast_days"] == 14
