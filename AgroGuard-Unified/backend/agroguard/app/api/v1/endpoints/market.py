"""Market Demand & Regional Trading Hub REST Endpoints."""

from typing import Any
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.services.market_demand import (
    CobwebGlutAnalysis,
    DemandProvenanceTag,
    MarketDemandService,
    market_demand_service,
    COMMODITY_MARKET_CHARACTERISTICS,
)
from app.services.regional_market import (
    RegionalMarketService,
    regional_market_service,
)

router = APIRouter(prefix="/market", tags=["market"])


class MarketDemandRequest(BaseModel):
    township: str = Field(..., description="Township name (e.g. 'Taunggyi', 'Kalaw', 'Pathein', or Burmese 'တောင်ကြီး')")
    commodity: str = Field(..., description="Commodity name (e.g. 'Maize', 'Cabbage', 'Rice', 'ပြောင်းဖူး')")
    instant_spot_price_usd_tonne: float | None = Field(None, description="Current spot price in USD/tonne")
    projected_acreage: float | None = Field(None, description="Current estimated sown acreage")
    acreage_expansion_pct: float | None = Field(None, description="Hypothetical acreage expansion percentage (+20, +50, +100)")
    days_to_harvest: int = Field(90, description="Agronomic days to harvest")


class BoostHedgingResponse(BaseModel):
    """Structured response for /market/boost and /boost UI widgets."""
    township: str
    commodity: str
    provenance: str
    instant_spot_price_usd_tonne: float | None
    projected_harvest_price_usd_tonne: float | None
    projected_price_change_pct: float | None
    is_hype_cycle_active: bool
    hype_cycle_phase: str | None
    cobweb_glut_risk_index: float | None
    glut_risk_level: str | None
    estimated_production_cost_usd_tonne: float | None
    forward_contract_benchmark_usd_tonne: float | None
    storage_feasible: bool
    strategic_storage_advice: str | None
    concrete_hedging_recommendations: list[str]
    economic_reasoning: dict[str, str] | None
    notes: str


@router.post("/demand-glut", response_model=CobwebGlutAnalysis)
def analyze_demand_glut(request: MarketDemandRequest) -> CobwebGlutAnalysis:
    """Analyze Cobweb Theorem demand shock and glut crash risk."""
    return market_demand_service.analyze_glut_risk(
        township=request.township,
        commodity=request.commodity,
        instant_spot_price_usd_tonne=request.instant_spot_price_usd_tonne,
        projected_acreage=request.projected_acreage,
        acreage_expansion_pct=request.acreage_expansion_pct,
        days_to_harvest=request.days_to_harvest,
    )


@router.get("/demand-glut", response_model=CobwebGlutAnalysis)
def get_demand_glut(
    township: str = Query(..., description="Township name"),
    commodity: str = Query(..., description="Commodity name"),
    instant_spot_price_usd_tonne: float | None = Query(None),
    acreage_expansion_pct: float | None = Query(None),
    days_to_harvest: int = Query(90),
) -> CobwebGlutAnalysis:
    return market_demand_service.analyze_glut_risk(
        township=township,
        commodity=commodity,
        instant_spot_price_usd_tonne=instant_spot_price_usd_tonne,
        acreage_expansion_pct=acreage_expansion_pct,
        days_to_harvest=days_to_harvest,
    )


@router.post("/boost", response_model=BoostHedgingResponse)
def boost_hedging_analysis(request: MarketDemandRequest) -> BoostHedgingResponse:
    """Evaluate market demand boom-and-bust cycle and generate concrete hedging recommendations."""
    res = market_demand_service.analyze_glut_risk(
        township=request.township,
        commodity=request.commodity,
        instant_spot_price_usd_tonne=request.instant_spot_price_usd_tonne,
        projected_acreage=request.projected_acreage,
        acreage_expansion_pct=request.acreage_expansion_pct,
        days_to_harvest=request.days_to_harvest,
    )

    reasoning_dict = None
    if res.economic_reasoning:
        reasoning_dict = {
            "current_market_state": res.economic_reasoning.current_market_state,
            "township_hype_and_rush_factor": res.economic_reasoning.township_hype_and_rush_factor,
            "projected_harvest_window_and_bottlenecks": res.economic_reasoning.projected_harvest_window_and_bottlenecks,
            "concrete_hedging_recommendations": res.economic_reasoning.concrete_hedging_recommendations,
        }

    return BoostHedgingResponse(
        township=res.township,
        commodity=res.commodity,
        provenance=res.provenance.value,
        instant_spot_price_usd_tonne=res.instant_spot_price_usd_tonne,
        projected_harvest_price_usd_tonne=res.projected_harvest_price_usd_tonne,
        projected_price_change_pct=res.projected_price_change_at_harvest_pct,
        is_hype_cycle_active=res.is_hype_cycle_active,
        hype_cycle_phase=res.hype_cycle_phase.value if res.hype_cycle_phase else None,
        cobweb_glut_risk_index=res.cobweb_glut_risk_index,
        glut_risk_level=res.glut_risk_level.value if res.glut_risk_level else None,
        estimated_production_cost_usd_tonne=res.estimated_production_cost_usd_tonne,
        forward_contract_benchmark_usd_tonne=res.forward_contract_benchmark_usd_tonne,
        storage_feasible=res.storage_economics.is_storage_feasible if res.storage_economics else False,
        strategic_storage_advice=res.storage_economics.strategic_advice if res.storage_economics else None,
        concrete_hedging_recommendations=res.hedging_recommendations,
        economic_reasoning=reasoning_dict,
        notes=res.notes,
    )


@router.get("/boost", response_model=BoostHedgingResponse)
def get_boost_hedging_analysis(
    township: str = Query(...),
    commodity: str = Query(...),
    instant_spot_price_usd_tonne: float | None = Query(None),
    acreage_expansion_pct: float | None = Query(None),
    days_to_harvest: int = Query(90),
) -> BoostHedgingResponse:
    req = MarketDemandRequest(
        township=township,
        commodity=commodity,
        instant_spot_price_usd_tonne=instant_spot_price_usd_tonne,
        acreage_expansion_pct=acreage_expansion_pct,
        days_to_harvest=days_to_harvest,
    )
    return boost_hedging_analysis(req)


@router.get("/township-baseline")
def get_township_baseline_endpoint(
    township: str = Query(...),
    commodity: str = Query(...),
) -> dict[str, Any]:
    baseline = market_demand_service.get_township_baseline(township, commodity)
    if not baseline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No baseline data for commodity '{commodity}' in township '{township}'.",
        )
    return baseline.model_dump()


@router.get("/supported-crops")
def get_supported_crops() -> list[dict[str, Any]]:
    crops = []
    for canon, spec in COMMODITY_MARKET_CHARACTERISTICS.items():
        crops.append({
            "canonical": canon,
            "tier": spec["tier"].value,
            "price_elasticity": spec["price_elasticity"],
            "shelf_life_days": spec["shelf_life_days"],
            "aliases": spec.get("aliases", []),
        })
    return crops
