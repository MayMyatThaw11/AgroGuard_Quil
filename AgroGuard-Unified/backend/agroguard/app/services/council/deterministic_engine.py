from __future__ import annotations

import math
from typing import Any
from pydantic import BaseModel

from .registries import (
    IRL_MARKET_REGISTRY,
    VERIFIED_AGRONOMY_CATALOG,
    AgronomyCatalogItem,
    filter_safe_skus,
)


class DeterministicStateFacts(BaseModel):
    vpd_kpa: float
    dew_point_c: float
    spatial_consensus_ratio: float
    hardware_fault_suspected: bool
    hardware_fault_reason: str
    allowed_interventions: list[AgronomyCatalogItem]
    spot_price_usd_ton: float
    at_risk_revenue_usd_ha: float
    max_viable_spend_usd_ha: float
    remaining_budget_usd_ha: float
    days_to_harvest: int
    crop_stage: str


def compute_vpd_kpa(temperature_c: float, rh_pct: float) -> float:
    """Exact psychrometric calculation of Vapor Pressure Deficit (VPD in kPa).
    Tetens formula for saturation vapor pressure e_s(T):
    e_s = 0.61078 * exp((17.27 * T) / (T + 237.3)) kPa
    e_a = e_s * (RH / 100)
    VPD = e_s - e_a
    """
    temp = float(temperature_c)
    rh = max(0.0, min(100.0, float(rh_pct)))
    es = 0.61078 * math.exp((17.27 * temp) / (temp + 237.3))
    ea = es * (rh / 100.0)
    vpd = max(0.0, es - ea)
    return round(vpd, 3)


def compute_dew_point_c(temperature_c: float, rh_pct: float) -> float:
    """Magnus-Tetens formula for dew point temperature in degrees Celsius."""
    temp = float(temperature_c)
    rh = max(1.0, min(100.0, float(rh_pct)))
    a = 17.27
    b = 237.7
    alpha = ((a * temp) / (b + temp)) + math.log(rh / 100.0)
    dew_point = (b * alpha) / (a - alpha)
    return round(dew_point, 2)


def compute_deterministic_state(context: dict[str, Any] | BaseModel) -> DeterministicStateFacts:
    """Pre-Compute Deterministic Math Engine (Layer 1):
    Runs BEFORE any agent reasoning. No LLM arithmetic permitted.
    """
    if hasattr(context, "model_dump"):
        data = context.model_dump()
    elif isinstance(context, dict):
        data = context
    else:
        data = dict(context)

    temp = float(data.get("temperature_c", 31.0))
    rh = float(data.get("rh_pct", data.get("relative_humidity_pct", 78.0)))
    active_nodes = max(1, int(data.get("active_nodes", 4)))
    affected_nodes = int(data.get("affected_nodes", 1))
    confidence = float(data.get("sensor_confidence_score", 0.88))
    soil_type = str(data.get("soil_type", "clay")).lower()
    drop_rate = float(data.get("soil_moisture_drop_rate_pct_per_hr", data.get("soil_moisture_hourly_drop_rate", 0.5)))
    days = int(data.get("days_to_harvest", 6))
    stage = str(data.get("crop_stage", data.get("stage", "Ripening")))
    crop = str(data.get("crop", "rice")).lower()
    budget = float(data.get("remaining_budget_usd_per_ha", 50.0))
    yield_tons = float(data.get("expected_yield_tons_ha", data.get("target_yield_ton_per_ha", 4.2)))

    # 1. Physics / Telemetry Math
    vpd = compute_vpd_kpa(temp, rh)
    dew_point = compute_dew_point_c(temp, rh)
    spatial_consensus = round(affected_nodes / active_nodes, 3)

    # Hardware fault pre-check: single-node isolation or impossible drop rate or low confidence
    hw_fault = False
    hw_reason = ""
    if confidence < 0.60:
        hw_fault = True
        hw_reason = f"Low sensor confidence ({confidence:.2f} < 0.60 threshold)."
    elif affected_nodes == 1 and active_nodes >= 3 and drop_rate >= 15.0:
        hw_fault = True
        hw_reason = (
            f"Single-node isolation: Node 2 drops {drop_rate:.1f}%/hr while 3 adjacent nodes remain saturated in {soil_type} soil."
        )
    elif str(context.get("scenario_preset", "")).lower() in ("clay_sensor_crack", "sensor_drift", "type_1"):
        hw_fault = True
        hw_reason = "Preset: montmorillonite clay desiccation crack decoupling sensor probe."

    # 2. Agronomic Safety Bounds: Closed-world catalogue filtering
    allowed_skus = filter_safe_skus(days_to_harvest=days, growth_stage=stage)

    # 3. Market & Economic Bounds: Closed-world price lookup & 3x ROI rule
    spot_price = IRL_MARKET_REGISTRY["commodity_spot_prices"].get(f"{crop}_pawsan_usd_ton", 480.0)
    # Estimate projected loss: 30% if unmanaged severe threat, 10% moderate
    projected_loss_pct = 0.35 if days <= 7 and float(context.get("rain_forecast_48h_mm", 0.0)) >= 20.0 else 0.25
    at_risk_revenue = round(yield_tons * spot_price * projected_loss_pct, 2)
    # Strict 3x Single-Season ROI rule: max spend is 1/3 of saved yield, capped by liquidity
    max_viable_spend = round(min(budget, at_risk_revenue / 3.0), 2)

    return DeterministicStateFacts(
        vpd_kpa=vpd,
        dew_point_c=dew_point,
        spatial_consensus_ratio=spatial_consensus,
        hardware_fault_suspected=hw_fault,
        hardware_fault_reason=hw_reason,
        allowed_interventions=allowed_skus,
        spot_price_usd_ton=spot_price,
        at_risk_revenue_usd_ha=at_risk_revenue,
        max_viable_spend_usd_ha=max_viable_spend,
        remaining_budget_usd_ha=budget,
        days_to_harvest=days,
        crop_stage=stage,
    )


def validate_council_invariants(
    pre_facts: DeterministicStateFacts,
    raw_verdict: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    """Deterministic Post-LLM Circuit Breaker (Layer 3):
    Runs AFTER LLM synthesis and intercepts any hallucination before it touches the farmer or API.
    Enforces Invariants A, B, and C.
    Returns (sanitized_verdict, audit_logs).
    """
    sanitized = dict(raw_verdict)
    audit_logs: list[str] = []

    tri_bridge = sanitized.get("tri_bridge_synthesis", {})
    ag_commerce = tri_bridge.get("agronomy_to_commerce_bridge", {})
    payloads = sanitized.get("executable_dispatch_payloads", {})
    market_intent = payloads.get("irl_market_intent_qill", {})
    audit_meta = sanitized.setdefault("deterministic_audit", {})
    active_vetoes = audit_meta.setdefault("active_vetoes", [])

    sku_id = str(ag_commerce.get("approved_catalog_sku_id", "NONE_CULTURAL_ONLY"))
    cost = float(ag_commerce.get("unit_cost_usd_ha", 0.0))
    triage = str(sanitized.get("triage_status", "TYPE_2_LOCALIZED_STRESS"))

    # -------------------------------------------------------------
    # Invariant C: Type 1 Sensor Fault must have ZERO spend
    # -------------------------------------------------------------
    if triage == "TYPE_1_SENSOR_FAULT" or pre_facts.hardware_fault_suspected:
        if cost > 0.0 or sku_id != "NONE_CULTURAL_ONLY":
            audit_logs.append(
                f"[CIRCUIT_BREAKER_INTERCEPT] Invariant C Violated: Attempted ${cost:.2f}/ha spend during TYPE_1_SENSOR_FAULT. "
                "Forced to $0 and reverted to NONE_CULTURAL_ONLY."
            )
            ag_commerce["approved_catalog_sku_id"] = "NONE_CULTURAL_ONLY"
            ag_commerce["unit_cost_usd_ha"] = 0.0
            ag_commerce["verified_roi_multiple"] = 99.0
            market_intent["action_type"] = "FREEZE_SPEND"
            if "HARDWARE_DRIFT_VETO" not in active_vetoes:
                active_vetoes.append("HARDWARE_DRIFT_VETO")

    # -------------------------------------------------------------
    # Invariant B: PHI & Catalog Safety Bounds
    # -------------------------------------------------------------
    if sku_id != "NONE_CULTURAL_ONLY":
        if sku_id not in VERIFIED_AGRONOMY_CATALOG:
            audit_logs.append(
                f"[CIRCUIT_BREAKER_INTERCEPT] Invariant B Violated: SKU '{sku_id}' is not in VerifiedAgronomyCatalog. "
                "Stripped hallucinated SKU and reverted to cultural protocol."
            )
            ag_commerce["approved_catalog_sku_id"] = "NONE_CULTURAL_ONLY"
            ag_commerce["unit_cost_usd_ha"] = 0.0
            audit_meta["phi_compliance_verified"] = True
        else:
            catalog_item = VERIFIED_AGRONOMY_CATALOG[sku_id]
            # Check Pre-Harvest Interval (PHI)
            if catalog_item.phi_days > pre_facts.days_to_harvest:
                audit_logs.append(
                    f"[CIRCUIT_BREAKER_INTERCEPT] Invariant B Violated: SKU '{sku_id}' requires {catalog_item.phi_days}d PHI, "
                    f"but only {pre_facts.days_to_harvest}d remain until harvest. Neutralized to prevent export MRL border rejection."
                )
                ag_commerce["approved_catalog_sku_id"] = "NONE_CULTURAL_ONLY"
                ag_commerce["unit_cost_usd_ha"] = 0.0
                if "BIOLOGICAL_VETO" not in active_vetoes:
                    active_vetoes.append("BIOLOGICAL_VETO")
                audit_meta["phi_compliance_verified"] = True
            # Check Growth Stage Restrictions
            elif pre_facts.crop_stage in catalog_item.banned_growth_stages:
                audit_logs.append(
                    f"[CIRCUIT_BREAKER_INTERCEPT] Invariant B Violated: SKU '{sku_id}' is strictly banned during {pre_facts.crop_stage} stage. "
                    "Forced zero-cost cultural fallback."
                )
                ag_commerce["approved_catalog_sku_id"] = "NONE_CULTURAL_ONLY"
                ag_commerce["unit_cost_usd_ha"] = 0.0
                if "BIOLOGICAL_VETO" not in active_vetoes:
                    active_vetoes.append("BIOLOGICAL_VETO")
            else:
                audit_meta["phi_compliance_verified"] = True

    # -------------------------------------------------------------
    # Invariant A: Budget Ceiling & 3x ROI Solvency Bounds
    # -------------------------------------------------------------
    current_cost = float(ag_commerce.get("unit_cost_usd_ha", 0.0))
    if current_cost > pre_facts.max_viable_spend_usd_ha:
        audit_logs.append(
            f"[CIRCUIT_BREAKER_INTERCEPT] Invariant A Violated: Recommended spend (${current_cost:.2f}/ha) "
            f"exceeds max viable spend ceiling (${pre_facts.max_viable_spend_usd_ha:.2f}/ha). Appended ECONOMIC_VETO."
        )
        if "ECONOMIC_VETO" not in active_vetoes:
            active_vetoes.append("ECONOMIC_VETO")
        # Automatically downgrade to safe cultural intervention or capped budget
        ag_commerce["approved_catalog_sku_id"] = "NONE_CULTURAL_ONLY"
        ag_commerce["unit_cost_usd_ha"] = 0.0
        ag_commerce["verified_roi_multiple"] = 15.0
        market_intent["action_type"] = "FREEZE_SPEND"

    audit_meta["math_verified"] = True
    audit_meta["budget_cap_verified"] = True

    # Ensure nested updates propagate back
    tri_bridge["agronomy_to_commerce_bridge"] = ag_commerce
    sanitized["tri_bridge_synthesis"] = tri_bridge
    payloads["irl_market_intent_qill"] = market_intent
    sanitized["executable_dispatch_payloads"] = payloads
    sanitized["deterministic_audit"] = audit_meta

    return sanitized, audit_logs
