import pytest
from app.services.council.orchestrator import CouncilOrchestrator
from app.services.council.deterministic_engine import (
    compute_vpd_kpa,
    compute_dew_point_c,
    compute_deterministic_state,
    validate_council_invariants,
)
from app.services.council.schemas import (
    GroundTruthStateVector,
    FarmerActionCardAlpha,
    IoTDownlinkCommandLou,
    IRLMarketIntentQill,
    ExecutableDispatchPayloads,
    TriBridgeSynthesis,
    CouncilVerdict,
    TimeHorizonActionPlan,
    ClosedLoopVerificationHook,
)
from app.services.council.registries import (
    VERIFIED_AGRONOMY_CATALOG,
    IRL_MARKET_REGISTRY,
    filter_safe_skus,
)


def test_deterministic_physics_math():
    """Verify Tetens equation VPD and Magnus dew point formulas are mathematically sound."""
    # At 30°C and 80% RH, saturation vapor pressure is ~4.24 kPa, actual ~3.39 kPa, VPD ~0.85 kPa
    vpd = compute_vpd_kpa(30.0, 80.0)
    assert 0.70 < vpd < 1.00

    # At 100% RH, VPD must be exactly 0.0
    vpd_saturated = compute_vpd_kpa(28.0, 100.0)
    assert abs(vpd_saturated) < 1e-4

    # Dew point at 25°C and 80% RH
    dp = compute_dew_point_c(25.0, 80.0)
    assert 20.0 < dp < 23.0


def test_post_llm_circuit_breaker_intercepts_sensor_fault_spend():
    """Invariant A: Under sensor fault, LLM cannot spend any money or dispatch chemicals."""
    raw_context = {
        "crop": "rice",
        "field_id": "Paddy-09",
        "stage": "Tillering",
        "days_to_harvest": 60,
        "temperature_c": 29.0,
        "relative_humidity_pct": 88.0,
        "soil_moisture_pct": 15.0,
        "soil_moisture_hourly_drop_rate": 32.0,  # Impossible drop: clay soil crack
        "active_nodes": 4,
        "affected_nodes": 1,  # Spatial consensus failure
        "sensor_confidence_score": 0.42,
        "remaining_budget_usd_per_ha": 100.0,
    }
    facts = compute_deterministic_state(raw_context)
    assert facts.hardware_fault_suspected is True

    # Intentionally craft a hallucinated payload where an LLM tried to prescribe $45 chemical during sensor fault
    mock_council_output = {
        "triage_status": "TYPE_1_SENSOR_FAULT",
        "deterministic_audit": {
            "active_vetoes": [],
        },
        "tri_bridge_synthesis": {
            "field_to_edge_bridge": {
                "tactile_prior": "Cracked dry soil near sensor casing",
                "telemetry_stream_ref": "node-01:soil_raw",
                "edge_anomaly_weight_adjustment": 0.15,
            },
            "edge_to_market_bridge": {
                "telemetry_ledger_entry": "Proof-01",
                "lou_verified_telemetry_proof": "Hardware artifact",
                "qill_buyer_grade_compliance_status": "COMPLIANT",
            },
            "agronomy_to_commerce_bridge": {
                "approved_catalog_sku_id": "SKU-CHEM-PROPICON-02",
                "unit_cost_usd_ha": 45.0,
                "verified_roi_multiple": 2.5,
            },
        },
        "executable_dispatch_payloads": {
            "farmer_action_card_alpha": {
                "t_plus_6h_zero_cost_task": "Blanket chemical spray",
                "exact_field_zone": "Zone-A",
                "tools_needed": "Sprayer",
            },
            "iot_downlink_command_lou": {
                "target_node_ids": ["node-01"],
                "new_wake_interval_sec": 600,
                "anomaly_threshold_patch": "None",
            },
            "irl_market_intent_qill": {
                "action_type": "DISPATCH_COOP_INPUT_ORDER",
                "counterparty_id": "Local Dealer",
                "protected_margin_usd_ha": 0.0,
            },
        },
    }

    sanitized, audit_logs = validate_council_invariants(facts, mock_council_output)

    # Circuit breaker must enforce zero spend and freeze market intent
    ag_commerce = sanitized["tri_bridge_synthesis"]["agronomy_to_commerce_bridge"]
    market_intent = sanitized["executable_dispatch_payloads"]["irl_market_intent_qill"]

    assert ag_commerce["unit_cost_usd_ha"] == 0.0
    assert ag_commerce["approved_catalog_sku_id"] == "NONE_CULTURAL_ONLY"
    assert market_intent["action_type"] == "FREEZE_SPEND"
    assert "HARDWARE_DRIFT_VETO" in sanitized["deterministic_audit"]["active_vetoes"]
    assert any("[CIRCUIT_BREAKER_INTERCEPT]" in log for log in audit_logs)


def test_post_llm_circuit_breaker_intercepts_phi_violation():
    """Invariant B: Cannot prescribe chemical with 21d PHI if harvest is in 6 days."""
    raw_context = {
        "crop": "rice",
        "field_id": "Paddy-04",
        "stage": "Ripening",
        "days_to_harvest": 6,  # 6 days to harvest
        "temperature_c": 28.0,
        "relative_humidity_pct": 85.0,
        "active_nodes": 4,
        "affected_nodes": 4,
        "sensor_confidence_score": 0.92,
        "remaining_budget_usd_per_ha": 100.0,
    }
    facts = compute_deterministic_state(raw_context)

    # Hallucinated LLM payload trying to spray propiconazole (21-day PHI)
    mock_council_output = {
        "triage_status": "TYPE_2_LOCALIZED_STRESS",
        "deterministic_audit": {
            "active_vetoes": [],
        },
        "tri_bridge_synthesis": {
            "field_to_edge_bridge": {
                "tactile_prior": "Brown sheath lesions",
                "telemetry_stream_ref": "node-all",
                "edge_anomaly_weight_adjustment": 0.85,
            },
            "edge_to_market_bridge": {
                "telemetry_ledger_entry": "Ledger-99",
                "lou_verified_telemetry_proof": "VPD drop validated",
                "qill_buyer_grade_compliance_status": "AT_RISK",
            },
            "agronomy_to_commerce_bridge": {
                "approved_catalog_sku_id": "SKU-CHEM-PROPICON-02",  # PHI is 21d!
                "unit_cost_usd_ha": 18.50,
                "verified_roi_multiple": 4.2,
            },
        },
        "executable_dispatch_payloads": {
            "farmer_action_card_alpha": {
                "t_plus_6h_zero_cost_task": "Chemical spray",
                "exact_field_zone": "All zones",
                "tools_needed": "Boom sprayer",
            },
            "iot_downlink_command_lou": {
                "target_node_ids": ["node-01"],
                "new_wake_interval_sec": 300,
                "anomaly_threshold_patch": "None",
            },
            "irl_market_intent_qill": {
                "action_type": "DISPATCH_COOP_INPUT_ORDER",
                "counterparty_id": "Local Dealer",
                "protected_margin_usd_ha": 50.0,
            },
        },
    }

    sanitized, audit_logs = validate_council_invariants(facts, mock_council_output)

    # Circuit breaker must intercept the PHI violation and replace with NONE_CULTURAL_ONLY
    ag_commerce = sanitized["tri_bridge_synthesis"]["agronomy_to_commerce_bridge"]
    assert ag_commerce["approved_catalog_sku_id"] == "NONE_CULTURAL_ONLY"
    assert ag_commerce["unit_cost_usd_ha"] == 0.0
    assert "BIOLOGICAL_VETO" in sanitized["deterministic_audit"]["active_vetoes"]
    assert any("Invariant B Violated" in log for log in audit_logs)


@pytest.mark.asyncio
async def test_full_pipeline_tri_bridge_and_veto_execution():
    """Verify that full council orchestration populates all 3 bridges and triggers appropriate vetoes."""
    # Scenario 2: Clay sensor crack false alarm
    context = {
        "crop": "rice",
        "field_id": "Zone-North-Clay",
        "stage": "Tillering",
        "soil_type": "heavy_clay",
        "soil_moisture_pct": 14.0,
        "soil_moisture_hourly_drop_rate": 35.0,
        "active_nodes": 4,
        "reporting_nodes": 4,
        "affected_nodes": 1,
        "sensor_confidence_score": 0.45,
        "temperature_c": 31.0,
        "relative_humidity_pct": 75.0,
        "days_to_harvest": 75,
        "remaining_budget_usd_per_ha": 60.0,
    }

    result = await CouncilOrchestrator.deliberate(context)

    # 1. Hardware drift veto triggered
    vetoes = [v.veto_type for v in result.active_vetoes_triggered]
    assert "HARDWARE_DRIFT_VETO" in vetoes
    assert result.triage_classification == "TYPE_1_SENSOR_FAULT"

    # 2. Tri-Bridge synthesis populated
    assert result.tri_bridge_synthesis is not None
    assert result.tri_bridge_synthesis.field_to_edge_bridge.alpha_visual_check_for_farmer
    assert result.tri_bridge_synthesis.edge_to_market_bridge.lou_verified_telemetry_proof
    assert result.tri_bridge_synthesis.agronomy_to_commerce_bridge.approved_catalog_sku_id == "NONE_CULTURAL_ONLY"

    # 3. Executable dispatch payloads populated and zero spend enforced
    assert result.executable_dispatch_payloads is not None
    assert len(result.executable_dispatch_payloads.iot_downlink_command_lou.target_node_ids) > 0
    assert result.executable_dispatch_payloads.irl_market_intent_qill.action_type == "FREEZE_SPEND"
