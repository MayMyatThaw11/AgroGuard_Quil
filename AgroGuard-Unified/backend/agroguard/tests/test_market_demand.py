"""Unit and Integration Tests for Market Demand & Glut Risk Engine.

Verifies:
1. Grounding in Shan State and Ayeyarwady township data (Agricultural Crop-production Data of Shan State.csv, township_agricultural_data.csv).
2. Strict anti-hallucination and provenance (unrecorded townships, unrecorded crops, invalid feeds).
3. High instant demand with low acreage saturation -> Low glut risk.
4. High instant demand with massive regional acreage rush & high perishability -> High/Critical post-hype glut crash risk.
5. Downside price calculations (+20%, +50%, +100% acreage shocks), production cost breaches, and storage economics.
6. Deep structured economic reasoning output for farmers and cooperatives.
7. Seamless bridge with RegionalMarketService and Agent Qill's economic evaluations.
"""

import pytest
from app.services.market_demand import (
    MarketDemandService,
    DemandProvenanceTag,
    DemandUnrecordedReason,
    PerishabilityTier,
    GlutRiskLevel,
    HypeCyclePhase,
    market_demand_service,
)
from app.services.regional_market import regional_market_service
from app.services.council.agents.market import MarketAgent


@pytest.fixture
def demand_service():
    """Returns the singleton or a fresh MarketDemandService."""
    return market_demand_service


# =========================================================================
# 1. GROUNDING IN REAL HISTORICAL CSV DATASETS
# =========================================================================

def test_grounding_shan_state_townships(demand_service):
    """Verify acreage baselines and volatility are loaded from Shan State CSV."""
    # Taunggyi Maize
    tg_maize = demand_service.get_township_baseline("Taunggyi", "Maize")
    assert tg_maize is not None
    assert tg_maize.township == "Taunggyi"
    assert tg_maize.canonical_commodity == "maize"
    assert 1400.0 <= tg_maize.historical_sown_acreage_mean <= 1900.0
    assert tg_maize.historical_sown_acreage_min >= 1400.0
    assert tg_maize.historical_sown_acreage_max <= 2000.0
    assert tg_maize.historical_acreage_cv is not None
    assert tg_maize.recorded_years_count >= 4
    assert tg_maize.historical_annual_production_capacity_tons is not None
    assert tg_maize.historical_annual_production_capacity_tons > 1000.0

    # Kalaw / Aungban Cabbage
    kalaw_cabbage = demand_service.get_township_baseline("Kalaw", "Cabbage")
    assert kalaw_cabbage is not None
    assert 800.0 <= kalaw_cabbage.historical_sown_acreage_mean <= 1100.0

    # Aungban alias maps to Kalaw
    aungban_cabbage = demand_service.get_township_baseline("Aungban", "Cabbage")
    assert aungban_cabbage is not None
    assert aungban_cabbage.historical_sown_acreage_mean == kalaw_cabbage.historical_sown_acreage_mean

    # Hopong Groundnut
    hopong_gn = demand_service.get_township_baseline("Hopong", "Groundnut")
    assert hopong_gn is not None
    assert 2500.0 <= hopong_gn.historical_sown_acreage_mean <= 3800.0
    assert hopong_gn.historical_acreage_cv is not None
    assert hopong_gn.historical_acreage_cv > 0.05  # Has real historical volatility


def test_grounding_ayeyarwady_pathein(demand_service):
    """Verify Pathein agricultural stats are grounded in township_agricultural_data.csv."""
    pathein_rice = demand_service.get_township_baseline("Pathein", "Rice")
    assert pathein_rice is not None
    assert pathein_rice.township == "Pathein"
    assert pathein_rice.canonical_commodity == "rice"
    assert pathein_rice.historical_yield_tons_per_ha is not None
    assert 3.5 <= pathein_rice.historical_yield_tons_per_ha <= 5.0
    assert pathein_rice.recorded_years_count > 0

    # Grounded variances from multi-year CSV
    assert pathein_rice.historical_price_mean_usd_tonne is not None
    assert pathein_rice.historical_price_variance is not None
    assert pathein_rice.historical_price_variance > 1000.0  # Real price variance
    assert pathein_rice.historical_yield_variance is not None

    # Strict anti-hallucination: acreage is NOT in township_agricultural_data.csv, must be None
    assert pathein_rice.historical_sown_acreage_mean is None
    assert pathein_rice.historical_annual_production_capacity_tons is None


# =========================================================================
# 2. STRICT ANTI-HALLUCINATION & PROVENANCE TESTS
# =========================================================================

def test_anti_hallucination_unrecorded_township(demand_service):
    """Verify unrecorded townships return explicit UNRECORDED provenance and null metrics."""
    result = demand_service.analyze_glut_risk(
        township="Atlantis",
        commodity="Maize",
        instant_spot_price_usd_tonne=300.0,
    )
    assert result.provenance == DemandProvenanceTag.UNRECORDED
    assert result.unrecorded_reason == DemandUnrecordedReason.UNRECORDED_TOWNSHIP
    assert result.instant_spot_price_usd_tonne is None
    assert result.cobweb_glut_risk_index is None
    assert result.glut_risk_level is None
    assert result.projected_harvest_volume_tons is None
    assert result.capacity_utilization_ratio is None
    assert "not recorded" in result.notes.lower() or "no recorded" in result.notes.lower()


def test_anti_hallucination_unrecorded_commodity(demand_service):
    """Verify unrecorded/unsupported commodities return explicit UNRECORDED."""
    result = demand_service.analyze_glut_risk(
        township="Taunggyi",
        commodity="UnobtainiumCrop",
        instant_spot_price_usd_tonne=500.0,
    )
    assert result.provenance == DemandProvenanceTag.UNRECORDED
    assert result.unrecorded_reason == DemandUnrecordedReason.UNRECORDED_COMMODITY
    assert result.cobweb_glut_risk_index is None
    assert result.glut_risk_level is None


def test_anti_hallucination_invalid_price_feed(demand_service):
    """Verify negative or non-finite price feeds are rejected without hallucinations."""
    res_neg = demand_service.analyze_glut_risk(
        township="Taunggyi",
        commodity="Maize",
        instant_spot_price_usd_tonne=-50.0,
    )
    assert res_neg.provenance == DemandProvenanceTag.UNRECORDED
    assert res_neg.unrecorded_reason == DemandUnrecordedReason.INVALID_PRICE_FEED

    res_zero = demand_service.analyze_glut_risk(
        township="Taunggyi",
        commodity="Maize",
        instant_spot_price_usd_tonne=0.0,
    )
    assert res_zero.provenance == DemandProvenanceTag.UNRECORDED
    assert res_zero.unrecorded_reason == DemandUnrecordedReason.INVALID_PRICE_FEED


# =========================================================================
# 3. HIGH DEMAND WITH LOW ACREAGE SATURATION -> LOW GLUT RISK
# =========================================================================

def test_high_instant_demand_low_saturation_low_glut_risk(demand_service):
    """High instant demand but disciplined/low acreage expansion results in LOW glut risk.

    Scenario: Spot price is high ($340 vs $281.5 baseline), but planted acreage is at
    or below baseline, low perishability (Maize).
    """
    res = demand_service.analyze_glut_risk(
        township="Taunggyi",
        commodity="Maize",
        instant_spot_price_usd_tonne=340.0,  # ~+20.8% hype
        projected_acreage=1600.0,            # Below baseline ~1685 acres
        days_to_harvest=90,
    )

    assert res.provenance == DemandProvenanceTag.MEASURED
    assert res.instant_demand_surge_ratio > 1.15
    assert res.is_hype_cycle_active is True
    assert res.hype_cycle_phase in (HypeCyclePhase.EARLY_RUSH, HypeCyclePhase.PEAK_HYPE)
    assert res.perishability_tier == PerishabilityTier.LOW

    # Saturation is controlled: volume does not breach infrastructure capacity
    assert res.capacity_utilization_ratio <= 1.0

    # Cobweb glut risk index must be LOW (< 0.35)
    assert res.cobweb_glut_risk_index is not None
    assert res.cobweb_glut_risk_index < 0.35
    assert res.glut_risk_level == GlutRiskLevel.LOW


# =========================================================================
# 4. HIGH DEMAND + MASSIVE ACREAGE RUSH + HIGH PERISHABILITY -> HIGH/CRITICAL GLUT RISK
# =========================================================================

def test_high_demand_massive_acreage_rush_high_perishability(demand_service):
    """High instant demand + massive regional planting rush + high perishability -> HIGH/CRITICAL glut crash risk.

    Scenario: Cabbage in Kalaw/Aungban with 2.0x acreage (+100% expansion),
    severe perishability (shelf life 10 days), spot price $650/t.
    """
    res = demand_service.analyze_glut_risk(
        township="Kalaw",
        commodity="Cabbage",
        instant_spot_price_usd_tonne=650.0,  # Hype price
        acreage_expansion_pct=100.0,         # Double baseline acreage
        days_to_harvest=75,
    )

    assert res.provenance == DemandProvenanceTag.MEASURED
    assert res.is_hype_cycle_active is True
    assert res.perishability_tier == PerishabilityTier.HIGH

    # Processing and transport capacity must be severely breached (> 1.5x)
    assert res.capacity_utilization_ratio is not None
    assert res.capacity_utilization_ratio > 1.5

    # Cobweb index must indicate high or critical glut crash risk (>= 0.70)
    assert res.cobweb_glut_risk_index is not None
    assert res.cobweb_glut_risk_index >= 0.70
    assert res.glut_risk_level in (GlutRiskLevel.HIGH, GlutRiskLevel.CRITICAL)


# =========================================================================
# 5. DOWNSIDE PRICE ELASTICITY & SCENARIO ANALYSIS
# =========================================================================

def test_downside_scenario_analysis_calculations(demand_service):
    """Verify downside price drops under +20%, +50%, and +100% supply shocks."""
    res = demand_service.analyze_glut_risk(
        township="Kalaw",
        commodity="Cabbage",
        instant_spot_price_usd_tonne=650.0,
        acreage_expansion_pct=50.0,
    )

    assert len(res.downside_scenarios) == 3
    s20, s50, s100 = res.downside_scenarios

    # Monotonic drop in price
    assert s20.projected_market_price_usd_tonne > s50.projected_market_price_usd_tonne > s100.projected_market_price_usd_tonne

    # Percentage drops become progressively more severe
    assert s20.price_change_pct < 0
    assert s50.price_change_pct < s20.price_change_pct
    assert s100.price_change_pct < s50.price_change_pct

    # Under +50% and +100% cabbage shocks, price plunges > 60%
    assert s50.price_change_pct < -50.0
    assert s100.price_change_pct < -75.0

    # Production cost breach is flagged
    assert s50.is_below_production_cost is True
    assert s50.net_margin_usd_per_ha < 0.0

    # MMK price per viss is populated
    assert s20.projected_price_mmk_per_viss > 0.0


# =========================================================================
# 6. STORAGE ECONOMICS DIFFERENTIATION
# =========================================================================

def test_storage_economics_differentiation(demand_service):
    """Verify storage economics differ properly between storable grains and perishables."""
    # Storable Maize
    res_maize = demand_service.analyze_glut_risk(
        township="Taunggyi",
        commodity="Maize",
        instant_spot_price_usd_tonne=320.0,
        acreage_expansion_pct=50.0,
    )
    assert res_maize.storage_economics is not None
    assert res_maize.storage_economics.is_storage_feasible is True
    assert res_maize.storage_economics.monthly_storage_cost_usd_tonne <= 10.0
    assert "dry_aerated_warehouse" in res_maize.storage_economics.storage_facility_type
    assert res_maize.storage_economics.net_storage_gain_usd_tonne > 0.0

    # Perishable Cabbage
    res_cabbage = demand_service.analyze_glut_risk(
        township="Kalaw",
        commodity="Cabbage",
        instant_spot_price_usd_tonne=600.0,
        acreage_expansion_pct=50.0,
    )
    assert res_cabbage.storage_economics is not None
    assert res_cabbage.storage_economics.is_storage_feasible is False
    assert "INFEASIBLE" in res_cabbage.storage_economics.strategic_advice


# =========================================================================
# 7. FORWARD CONTRACTING BENCHMARK
# =========================================================================

def test_forward_contracting_benchmark(demand_service):
    """Verify forward contract floor benchmark provides substantial downside protection."""
    res = demand_service.analyze_glut_risk(
        township="Taunggyi",
        commodity="Maize",
        instant_spot_price_usd_tonne=340.0,
        acreage_expansion_pct=50.0,
    )
    assert res.forward_contract_benchmark_usd_tonne is not None
    # Forward contract price should protect a floor above crashed price
    s50 = next(s for s in res.downside_scenarios if s.acreage_shock_pct == 50.0)
    assert res.forward_contract_benchmark_usd_tonne > s50.projected_market_price_usd_tonne


# =========================================================================
# 8. DEEP ECONOMIC REASONING ENGINE STRUCTURE
# =========================================================================

def test_deep_economic_reasoning_structure(demand_service):
    """Verify all 4 required economic reasoning sections and hedging bullets are populated."""
    res = demand_service.analyze_glut_risk(
        township="Kalaw",
        commodity="Cabbage",
        instant_spot_price_usd_tonne=650.0,
        acreage_expansion_pct=60.0,
        days_to_harvest=80,
    )

    reasoning = res.economic_reasoning
    assert reasoning is not None

    # (a) Current market state
    assert len(reasoning.current_market_state) > 20
    assert "spot price" in reasoning.current_market_state.lower()
    assert "baseline" in reasoning.current_market_state.lower()

    # (b) Township hype and rush factor
    assert len(reasoning.township_hype_and_rush_factor) > 20
    assert "kalaw" in reasoning.township_hype_and_rush_factor.lower()
    assert "acres" in reasoning.township_hype_and_rush_factor.lower()

    # (c) Projected harvest window & bottlenecks
    assert len(reasoning.projected_harvest_window_and_bottlenecks) > 20
    assert "80" in reasoning.projected_harvest_window_and_bottlenecks
    assert "downside" in reasoning.projected_harvest_window_and_bottlenecks.lower()

    # (d) Concrete hedging recommendations
    assert len(reasoning.concrete_hedging_recommendations) > 20
    assert "staggered" in reasoning.concrete_hedging_recommendations.lower()

    # Bullets list
    assert len(res.hedging_recommendations) >= 4
    assert any("staggered" in b.lower() for b in res.hedging_recommendations)
    assert any("forward" in b.lower() for b in res.hedging_recommendations)
    assert any("intercrop" in b.lower() for b in res.hedging_recommendations)


# =========================================================================
# 9. INTEGRATION WITH REGIONAL MARKET SERVICE
# =========================================================================

def test_regional_market_service_bridge():
    """Verify regional_market_service can execute analyze_market_demand seamlessly."""
    analysis = regional_market_service.analyze_market_demand(
        township="Taunggyi",
        commodity="Maize",
        instant_spot_price_usd_tonne=320.0,
    )
    assert analysis.provenance == DemandProvenanceTag.MEASURED
    assert analysis.commodity_canonical == "maize"
    assert analysis.cobweb_glut_risk_index is not None


# =========================================================================
# 10. INTEGRATION WITH AGENT QILL (COUNCIL GLUT RESTRUCTURE)
# =========================================================================

def test_council_market_agent_regional_glut_handling():
    """Verify Agent Qill triggers RESTRUCTURE and flags regional glut crash risk."""
    assessment = MarketAgent.evaluate({
        "crop": "cabbage",
        "stage": "Vegetative",
        "scenario_preset": "regional_glut",
        "glut_risk_level": "CRITICAL",
        "cobweb_glut_risk_index": 0.85,
        "crop_economic_value_usd_ha": 3500.0,
        "remaining_budget_usd_per_ha": 60.0,
    })
    assert assessment.stance == "RESTRUCTURE"
    assert "ECONOMIC_VETO" in assessment.core_argument or "ECONOMIC_VETO" in assessment.unit_economics_impact
    assert "forward-contracting" in assessment.unit_economics_impact.lower()


# =========================================================================
# 11. API SERIALIZATION & DICTIONARY CONVERSION
# =========================================================================

def test_to_api_dict_serialization(demand_service):
    """Verify to_api_dict handles both valid and unrecorded quotes cleanly."""
    valid_res = demand_service.analyze_glut_risk("Taunggyi", "Maize", instant_spot_price_usd_tonne=300.0)
    d_valid = valid_res.to_api_dict()
    assert isinstance(d_valid, dict)
    assert d_valid["township"] == "Taunggyi"
    assert d_valid["cobweb_glut_risk_index"] is not None

    unq_res = demand_service.analyze_glut_risk("Atlantis", "Maize")
    d_unq = unq_res.to_api_dict()
    assert isinstance(d_unq, dict)
    assert d_unq["provenance"] == "UNRECORDED"
    assert d_unq["cobweb_glut_risk_index"] is None
    assert d_unq["unrecorded_reason"] == "unrecorded_township"


# =========================================================================
# 12. BURMESE TOWNSHIP & COMMODITY RESOLUTION
# =========================================================================

def test_burmese_township_and_crop_resolution(demand_service):
    """Verify Burmese township and crop queries resolve to grounded historical data."""
    # တောင်ကြီး ပြောင်းဖူး -> Taunggyi Maize
    res = demand_service.analyze_glut_risk(
        township="တောင်ကြီး",
        commodity="ပြောင်းဖူး",
        instant_spot_price_usd_tonne=340.0,
    )
    assert res.provenance == DemandProvenanceTag.MEASURED
    assert res.commodity_canonical == "maize"
    assert res.baseline_sown_acres is not None
    assert 1400.0 <= res.baseline_sown_acres <= 1900.0
    assert res.cobweb_glut_risk_index is not None

    # ကလော ဂေါ်ဖီထုပ် -> Kalaw Cabbage
    res_kalaw = demand_service.analyze_glut_risk(
        township="ကလော",
        commodity="ဂေါ်ဖီထုပ်",
        instant_spot_price_usd_tonne=600.0,
        acreage_expansion_pct=50.0,
    )
    assert res_kalaw.provenance == DemandProvenanceTag.MEASURED
    assert res_kalaw.commodity_canonical == "cabbage"
    assert res_kalaw.glut_risk_level in (GlutRiskLevel.HIGH, GlutRiskLevel.CRITICAL)

    # ဟိုပုံး မြေပဲ -> Hopong Groundnut
    hopong_base = demand_service.get_township_baseline("ဟိုပုံး", "မြေပဲ")
    assert hopong_base is not None
    assert hopong_base.canonical_commodity == "groundnut"
    assert 2500.0 <= hopong_base.historical_sown_acreage_mean <= 3800.0


# =========================================================================
# 13. STRICT ANTI-HALLUCINATION FOR UNRECORDED CROPS IN RECORDED TOWNSHIPS
# =========================================================================

def test_unrecorded_crop_in_recorded_township_returns_insufficient_historical_data(demand_service):
    """Verify valid crops with no historical township records return INSUFFICIENT_HISTORICAL_DATA."""
    # Potato is a valid crop, but NOT grown/recorded in Taunggyi
    res = demand_service.analyze_glut_risk("Taunggyi", "potato")
    assert res.provenance == DemandProvenanceTag.UNRECORDED
    assert res.unrecorded_reason == DemandUnrecordedReason.INSUFFICIENT_HISTORICAL_DATA
    assert res.baseline_sown_acres is None
    assert res.projected_current_acres is None
    assert res.cobweb_glut_risk_index is None
    assert res.glut_risk_level is None
    assert res.capacity_utilization_ratio is None

    # Pathein Rice without explicit expansion projection returns unrecorded
    res_pathein = demand_service.analyze_glut_risk("Pathein", "Rice")
    assert res_pathein.provenance == DemandProvenanceTag.UNRECORDED
    assert res_pathein.unrecorded_reason == DemandUnrecordedReason.INSUFFICIENT_HISTORICAL_DATA
    assert res_pathein.cobweb_glut_risk_index is None

    # Pathein Rice WITH explicit expansion scenario calculates risk without synthetic baseline acreage
    res_pathein_exp = demand_service.analyze_glut_risk("Pathein", "Rice", acreage_expansion_pct=50.0)
    assert res_pathein_exp.provenance == DemandProvenanceTag.HISTORICAL_INDEX
    assert res_pathein_exp.baseline_sown_acres is None  # Never hallucinated!
    assert res_pathein_exp.cobweb_glut_risk_index is not None
    assert len(res_pathein_exp.downside_scenarios) == 3


# =========================================================================
# 14. PROJECTED HARVEST PRICE & COMMODITY BASKET DIFFERENTIATION
# =========================================================================

def test_projected_harvest_price_and_elasticity_differentiation(demand_service):
    """Verify projected harvest price reflects price elasticity and uses correct commodity basket weights."""
    res_cabbage = demand_service.analyze_glut_risk(
        township="Kalaw",
        commodity="Cabbage",
        instant_spot_price_usd_tonne=650.0,
        acreage_expansion_pct=50.0,
        days_to_harvest=75,
    )
    assert res_cabbage.projected_harvest_price_usd_tonne is not None
    assert res_cabbage.projected_harvest_price_mmk_viss is not None
    assert res_cabbage.projected_price_change_at_harvest_pct is not None

    # Spot price $650 plunges significantly at harvest under +50% expansion
    assert res_cabbage.projected_harvest_price_usd_tonne < 350.0
    assert res_cabbage.projected_price_change_at_harvest_pct < -40.0

    # Verify MMK viss calculation in downside scenarios uses specific commodity conversions
    s50_cabbage = res_cabbage.downside_scenarios[1]
    res_maize = demand_service.analyze_glut_risk(
        township="Taunggyi",
        commodity="Maize",
        instant_spot_price_usd_tonne=650.0,  # Same spot price for direct comparison
        acreage_expansion_pct=50.0,
    )
    s50_maize = res_maize.downside_scenarios[1]

    # Inelastic cabbage plunges far more than elastic maize under identical 50% supply shock
    assert s50_cabbage.projected_market_price_usd_tonne < s50_maize.projected_market_price_usd_tonne


# =========================================================================
# 15. POST-HYPE GLUT PHASE ASSIGNMENT
# =========================================================================

def test_post_hype_glut_phase_assignment(demand_service):
    """Verify HypeCyclePhase.POST_HYPE_GLUT is assigned when market experiences post-rush collapse."""
    # Depressed spot price after massive regional acreage expansion
    res = demand_service.analyze_glut_risk(
        township="Kalaw",
        commodity="Cabbage",
        instant_spot_price_usd_tonne=200.0,  # Low price (< 0.85 of baseline $435.95)
        acreage_expansion_pct=60.0,          # High expansion shock
    )
    assert res.hype_cycle_phase == HypeCyclePhase.POST_HYPE_GLUT


# =========================================================================
# 16. COUNCIL ORCHESTRATOR DELIBERATION WITH REGIONAL GLUT
# =========================================================================

@pytest.mark.asyncio
async def test_council_orchestrator_regional_glut_deliberation():
    """Verify CouncilOrchestrator generates economic veto, cohort staggering, and forward contracts for glut scenario."""
    from app.services.council.orchestrator import CouncilOrchestrator

    ctx = {
        "crop": "cabbage",
        "field_id": "Shan-Plot-04",
        "stage": "Vegetative",
        "scenario_preset": "regional_glut",
        "glut_risk_level": "CRITICAL",
        "cobweb_glut_risk_index": 0.85,
        "crop_economic_value_usd_ha": 3500.0,
        "remaining_budget_usd_per_ha": 60.0,
    }

    res = await CouncilOrchestrator.deliberate(ctx)

    # 1. Triage must be SYSTEMIC CRISIS
    assert res.triage_status == "TYPE_3_SYSTEMIC_CRISIS"

    # 2. Verdict must issue ECONOMIC_VETO and mandate staggered cohorts, NOT rice combine harvester
    verdict = res.council_verdict.final_decision
    assert "ECONOMIC_VETO" in verdict
    assert "staggered planting cohorts" in verdict
    assert "combine harvester" not in verdict.lower()

    # 3. Farmer Action Card Alpha must direct cohort staggering
    farmer_task = res.executable_dispatch_payloads.farmer_action_card_alpha.t_plus_6h_zero_cost_task
    assert "staggered" in farmer_task.lower()

    # 4. Market Intent Qill must lock forward contract lot
    market_intent = res.executable_dispatch_payloads.irl_market_intent_qill
    assert market_intent.action_type == "LOCK_FORWARD_HARVEST_LOT"


# =========================================================================
# 17. REST API ENDPOINTS FOR DEMAND-GLUT AND /BOOST
# =========================================================================

def test_market_rest_api_endpoints():
    """Verify REST API endpoints for demand-glut and /boost hedging respond correctly."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api.v1.endpoints.market import router as market_router

    app = FastAPI()
    app.include_router(market_router)
    client = TestClient(app)

    # 1. Supported crops
    r_crops = client.get("/market/supported-crops")
    assert r_crops.status_code == 200
    crops = r_crops.json()
    assert any(c["canonical"] == "cabbage" for c in crops)
    assert any(c["canonical"] == "sorghum" for c in crops)

    # 2. Demand Glut GET
    r_glut = client.get("/market/demand-glut?township=Taunggyi&commodity=Maize&instant_spot_price_usd_tonne=340.0")
    assert r_glut.status_code == 200
    d_glut = r_glut.json()
    assert d_glut["provenance"] == "MEASURED"
    assert d_glut["cobweb_glut_risk_index"] is not None
    assert d_glut["projected_harvest_price_usd_tonne"] is not None

    # 3. Boost Hedging POST
    r_boost = client.post("/market/boost", json={
        "township": "Kalaw",
        "commodity": "Cabbage",
        "instant_spot_price_usd_tonne": 650.0,
        "acreage_expansion_pct": 50.0,
        "days_to_harvest": 75,
    })
    assert r_boost.status_code == 200
    d_boost = r_boost.json()
    assert d_boost["glut_risk_level"] in ("HIGH", "CRITICAL")
    assert d_boost["storage_feasible"] is False
    assert len(d_boost["concrete_hedging_recommendations"]) >= 4
    assert d_boost["economic_reasoning"] is not None
    assert "current_market_state" in d_boost["economic_reasoning"]

    # 4. Township baseline GET
    r_base = client.get("/market/township-baseline?township=Pathein&commodity=Rice")
    assert r_base.status_code == 200
    d_base = r_base.json()
    assert d_base["historical_yield_tons_per_ha"] is not None
    assert d_base["historical_price_variance"] is not None
    assert d_base["historical_sown_acreage_mean"] is None

