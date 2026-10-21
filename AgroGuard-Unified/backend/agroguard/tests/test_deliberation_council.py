import pytest

from app.services.council.orchestrator import CouncilOrchestrator
from app.services.council.schemas import (
    DeliberationResponse,
    InitialAssessments,
    CouncilVerdict,
)


@pytest.mark.asyncio
async def test_3_stage_deliberation_pipeline_rice():
    context = {
        "crop": "rice",
        "field_id": "Paddy-01",
        "stage": "Ripening",
        "water_depth_cm": -12.0,
        "rain_forecast_48h_mm": 15.0,
        "wind_speed_ms": 3.2,
        "grain_moisture_pct": 23.0,
        "days_to_harvest": 6,
    }

    result = await CouncilOrchestrator.deliberate(context)

    # 1. Verify schema compliance
    assert isinstance(result, DeliberationResponse)
    assert result.query_context
    assert isinstance(result.initial_assessments, InitialAssessments)
    assert len(result.cross_examination) == 6
    assert isinstance(result.council_verdict, CouncilVerdict)

    # 2. Verify Stage 1 Independent Assessments
    ag = result.initial_assessments.agriculture
    tech = result.initial_assessments.tech
    market = result.initial_assessments.market

    assert ag.stance in ("APPROVE", "CAUTION", "REJECT")
    assert ag.core_argument
    assert ag.blind_spot_warning

    assert tech.stance in ("APPROVE", "CAUTION", "REJECT")
    assert tech.core_argument
    assert tech.system_constraint

    assert market.stance in ("APPROVE", "CAUTION", "REJECT")
    assert market.core_argument
    assert market.unit_economics_impact

    # 3. Verify Stage 2 Cross-Examination Friction
    cross_pairs = [(item.from_agent, item.to_agent) for item in result.cross_examination]
    assert ("agriculture", "tech") in cross_pairs
    assert ("agriculture", "market") in cross_pairs
    assert ("tech", "agriculture") in cross_pairs
    assert ("tech", "market") in cross_pairs
    assert ("market", "agriculture") in cross_pairs
    assert ("market", "tech") in cross_pairs

    for item in result.cross_examination:
        assert item.challenge
        assert item.proposed_compromise

    # 4. Verify Stage 3 Council Verdict & Decision Matrix
    verdict = result.council_verdict
    assert verdict.final_decision
    assert len(verdict.key_tradeoffs_made) >= 3
    assert verdict.action_plan.field_execution
    assert verdict.action_plan.technical_implementation
    assert verdict.action_plan.commercial_positioning

    # 5. Verify AMCHAM 8-Point Project Plan Standard
    plan = verdict.project_plan
    assert plan is not None
    # 01 SMART Objective
    assert plan.smart_objective.specific
    assert plan.smart_objective.measurable
    assert plan.smart_objective.achievable
    assert plan.smart_objective.relevant
    assert plan.smart_objective.time_bound
    # 02 Scope & Deliverables (Define the work)
    assert plan.scope_and_deliverables.project_objective
    assert len(plan.scope_and_deliverables.deliverables) >= 3
    assert len(plan.scope_and_deliverables.success_criteria) >= 3
    assert len(plan.scope_and_deliverables.scope_included) >= 2
    assert len(plan.scope_and_deliverables.scope_excluded) >= 2
    # 03 Stakeholders
    assert len(plan.stakeholders) >= 3
    # 04 RACI Matrix
    assert len(plan.raci_matrix) >= 4
    for item in plan.raci_matrix:
        assert item.responsible
        assert item.accountable
        assert item.consulted
        assert item.informed
    # 05 WBS (What, Who, When, Dependency, Milestone)
    assert len(plan.wbs) >= 4
    for wbs in plan.wbs:
        assert wbs.what
        assert wbs.who
        assert wbs.when
        assert wbs.dependency
        assert wbs.milestone
    # 06 Timeline & Milestones
    assert len(plan.timeline_and_milestones) >= 4
    # 07 Top Risks + 3x3 Heat Map (At least 5 risks)
    assert len(plan.top_risks) >= 5
    for r in plan.top_risks:
        assert r.likelihood in ("Low", "Medium", "High")
        assert r.impact in ("Low", "Medium", "High")
        assert r.heat_score in ("Low", "Medium", "High")
        assert r.mitigation_plan
        assert r.owner
    # 08 Mitigation Plan
    assert len(plan.mitigation_summary) >= 3

    # 6. Verify Persona Ground Rules: Build It. Break It. Pitch It.
    assert ag.build_break_pitch is not None
    assert ag.build_break_pitch.build_it
    assert ag.build_break_pitch.break_it
    assert ag.build_break_pitch.pitch_it

    assert tech.build_break_pitch is not None
    assert tech.build_break_pitch.build_it
    assert tech.build_break_pitch.break_it
    assert tech.build_break_pitch.pitch_it

    assert market.build_break_pitch is not None
    assert market.build_break_pitch.build_it
    assert market.build_break_pitch.break_it
    assert market.build_break_pitch.pitch_it


@pytest.mark.asyncio
async def test_wind_ceiling_hard_halt():
    context = {
        "crop": "rice",
        "field_id": "Paddy-01",
        "stage": "Ripening",
        "wind_speed_ms": 6.8,  # Exceeds 5.5 m/s ceiling
    }

    result = await CouncilOrchestrator.deliberate(context)

    # Tech must reject due to wind ceiling
    assert result.initial_assessments.tech.stance == "REJECT"
    assert "5.5" in result.initial_assessments.tech.core_argument
    assert "HALT" in result.council_verdict.final_decision


@pytest.mark.asyncio
async def test_rice_tillering_non_ripening_branch():
    context = {
        "crop": "rice",
        "field_id": "Paddy-02",
        "stage": "Tillering",
        "water_depth_cm": -5.0,
        "rain_forecast_48h_mm": 20.0,
        "wind_speed_ms": 2.5,
    }

    result = await CouncilOrchestrator.deliberate(context)
    # Must NOT fall into coffee harvest
    assert "coffee" not in result.council_verdict.final_decision.lower()
    assert "crimson cherries" not in result.council_verdict.final_decision.lower()
    assert "Alternate Wetting and Drying" in result.council_verdict.final_decision


def test_council_router_endpoints():
    from app.api.v1.endpoints.council import router as council_router
    routes = [route.path for route in council_router.routes]
    assert "/deliberate" in routes or "/council/deliberate" in routes
    assert "/evaluate" in routes or "/council/evaluate" in routes
    assert "/ping" in routes or "/council/ping" in routes
    assert "/chat" in routes or "/council/chat" in routes


@pytest.mark.asyncio
async def test_clay_sensor_crack_hardware_drift_veto():
    """Scenario 2: Capacitive sensor cracks in clay soil.
    Lou triggers HARDWARE_DRIFT_VETO; Alpha issues BIOLOGICAL_VETO; Qill blocks $0 spend.
    Prioritizes TYPE_1_SENSOR_FAULT.
    """
    context = {
        "crop": "rice",
        "field_id": "Paddy-01",
        "soil_type": "clay",
        "active_nodes": 4,
        "affected_nodes": 1,
        "soil_moisture_drop_rate_pct_per_hr": 40.0,
        "scenario_preset": "clay_sensor_crack",
    }
    result = await CouncilOrchestrator.deliberate(context)
    assert result.triage_classification == "TYPE_1_SENSOR_FAULT"
    veto_types = [v.veto_type for v in result.active_vetoes_triggered]
    assert "HARDWARE_DRIFT_VETO" in veto_types
    assert result.time_horizon_action_plan.t_plus_6_hours_field_triage_alpha.cash_required_usd == 0.0
    assert "tamp" in result.time_horizon_action_plan.t_plus_6_hours_field_triage_alpha.exact_farmer_action.lower()


@pytest.mark.asyncio
async def test_monsoon_blight_biological_veto():
    """Scenario 1: Monsoon cloud cover + fungal blight risk.
    Alpha issues BIOLOGICAL_VETO against blanket spraying; forces cultural pruning + 30% spot-spray.
    """
    context = {
        "crop": "rice",
        "field_id": "Paddy-01",
        "stage": "Flowering",
        "leaf_wetness_hours": 14.0,
        "vpd_kpa": 0.35,
        "scenario_preset": "monsoon_blight",
    }
    result = await CouncilOrchestrator.deliberate(context)
    assert result.triage_classification == "TYPE_2_LOCALIZED_STRESS"
    veto_types = [v.veto_type for v in result.active_vetoes_triggered]
    assert "BIOLOGICAL_VETO" in veto_types
    assert result.closed_loop_verification_hook.check_in_hours == 48
    assert result.time_horizon_action_plan.t_plus_6_hours_field_triage_alpha.cash_required_usd == 0.0


@pytest.mark.asyncio
async def test_fertilizer_spike_economic_veto():
    """Scenario 3: Mid-season fertilizer price spike (+45%).
    Qill triggers ECONOMIC_VETO against blanket NPK; pivots to $14/ha foliar micro-dosing.
    """
    context = {
        "crop": "rice",
        "field_id": "Paddy-01",
        "remaining_budget_usd_per_ha": 35.0,
        "scenario_preset": "fertilizer_spike",
    }
    result = await CouncilOrchestrator.deliberate(context)
    veto_types = [v.veto_type for v in result.active_vetoes_triggered]
    assert "ECONOMIC_VETO" in veto_types
    assert result.time_horizon_action_plan.t_plus_7_days_system_and_inputs_lou.budget_allocated_usd_ha <= 20.0


@pytest.mark.asyncio
async def test_pre_harvest_rain_systemic_crisis():
    """Scenario 4: Pre-harvest storm threat.
    TYPE_3_SYSTEMIC_CRISIS: Advances harvest 48h early to avoid 35% dockage.
    """
    context = {
        "crop": "rice",
        "field_id": "Paddy-01",
        "stage": "Ripening",
        "rain_forecast_48h_mm": 25.0,
        "scenario_preset": "pre_harvest_rain",
    }
    result = await CouncilOrchestrator.deliberate(context)
    assert result.triage_classification == "TYPE_3_SYSTEMIC_CRISIS"
    assert "early" in result.council_verdict.final_decision.lower()

