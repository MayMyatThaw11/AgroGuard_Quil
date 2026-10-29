import pytest

from app.services import regional_market
from app.services.council.orchestrator import CouncilOrchestrator


@pytest.mark.asyncio
async def test_council_context_uses_regional_quote(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[dict] = []
    real = regional_market.regional_market_service.enrich_council_context

    def spy(context: dict, **kwargs) -> dict:
        seen.append(dict(context))
        return real(context, **kwargs)

    monkeypatch.setattr(regional_market.regional_market_service, "enrich_council_context", spy)
    await CouncilOrchestrator.deliberate({"crop": "Maize", "market_center": "Taunggyi", "stage": "Ripening"})
    assert seen and seen[0]["market_center"] == "Taunggyi"


@pytest.mark.asyncio
async def test_council_skips_market_lookup_when_value_given(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(*args, **kwargs):
        raise AssertionError("market lookup should not run")

    monkeypatch.setattr(regional_market.regional_market_service, "enrich_council_context", fail)
    await CouncilOrchestrator.deliberate({"crop": "Maize", "market_center": "Taunggyi", "crop_economic_value_usd_ha": 900.0})


@pytest.mark.asyncio
async def test_glut_branch_numbers_have_provenance() -> None:
    measured = await CouncilOrchestrator.deliberate(
        {"scenario_preset": "regional_glut", "projected_price_change_at_harvest_pct": -35.0, "crop_economic_value_usd_ha": 1000.0}
    )
    assert "40-70%" not in measured.council_verdict.final_decision
    assert "35%" in measured.council_verdict.final_decision

    unmeasured = await CouncilOrchestrator.deliberate({"scenario_preset": "regional_glut"})
    assert "40-70%" not in unmeasured.council_verdict.final_decision
    assert "not measured" in unmeasured.council_verdict.final_decision
    assert "TO VERIFY" in unmeasured.council_verdict.final_decision


@pytest.mark.parametrize(
    "path",
    ["/market/supported-crops", "/market/demand-glut?township=Taunggyi&commodity=Maize", "/market/township-baseline?township=Pathein&commodity=Paddy"],
)
def test_market_routes_require_user(path: str) -> None:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.api.v1.endpoints.market import router as market_router

    app = FastAPI()
    app.include_router(market_router)
    assert TestClient(app).get(path).status_code == 401
