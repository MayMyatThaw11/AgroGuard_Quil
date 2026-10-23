from __future__ import annotations

import json
import logging
from typing import Any, Literal

import httpx
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ConfigDict

from app.core.config import get_settings
from app.services.council.orchestrator import CouncilOrchestrator
from app.services.council.schemas import DeliberationResponse
from app.services.llm_provider_adapter import ProviderConfig, ping_provider, stream_provider_chat
from app.services.subagents_council import (
    CropType,
    SubAgentId,
    evaluate_pre_harvest_council,
)

router = APIRouter(prefix="/council", tags=["subagents-council"])
logger = logging.getLogger(__name__)


class CouncilEvaluationRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    crop: CropType = "rice"
    field_id: str = "Paddy-01"
    stage: str = "Ripening"
    water_depth_cm: float = -12.0
    rain_forecast_48h_mm: float = 15.0
    wind_speed_ms: float = 3.2
    temperature_c: float = 31.0
    rh_pct: float = 88.0
    ndvi_slope: float = -0.04
    grain_moisture_pct: float | None = 23.0
    days_to_harvest: int = 6
    farm_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_.-]{1,64}$")


class ProviderPingRequest(BaseModel):
    provider: Literal["ollama", "openai", "claude", "gemini", "groq", "custom"] = "groq"
    endpoint: str = ""
    api_key: str | None = None
    model: str = ""


class PersonaChatRequest(BaseModel):
    agent_id: SubAgentId
    message: str
    crop: CropType = "rice"
    field_id: str = "Paddy-01"
    provider_config: ProviderPingRequest | None = None


@router.post(
    "/deliberate",
    response_model=DeliberationResponse,
    status_code=status.HTTP_200_OK,
    summary="3-Stage Deliberation Pipeline: Initial Assessment -> Cross-Examination -> Synthesis Matrix",
)
async def deliberate_council(req: CouncilEvaluationRequest) -> DeliberationResponse:
    """Executes the full 3-stage multi-agent deliberation:
    - Stage 1: Independent Domain Assessment (Agriculture vs Tech vs Market in parallel)
    - Stage 2: Cross-Examination Friction Round (Sharp Counter-Arguments)
    - Stage 3: Council Synthesis & Actionable Decision Matrix
    """
    context = req.model_dump()
    return await CouncilOrchestrator.deliberate(context)


@router.post("/evaluate", status_code=status.HTTP_200_OK, summary="Evaluate scenario with all 3 sub-agents")
async def evaluate_scenario(req: CouncilEvaluationRequest) -> dict[str, Any]:
    evaluation = evaluate_pre_harvest_council(
        crop=req.crop,
        field_id=req.field_id,
        stage=req.stage,
        water_depth_cm=req.water_depth_cm,
        rain_forecast_48h_mm=req.rain_forecast_48h_mm,
        wind_speed_ms=req.wind_speed_ms,
        temperature_c=req.temperature_c,
        rh_pct=req.rh_pct,
        ndvi_slope=req.ndvi_slope,
        grain_moisture_pct=req.grain_moisture_pct,
        days_to_harvest=req.days_to_harvest,
    )
    out = evaluation.to_dict()
    if req.farm_id:
        await _record_in_vault(req.farm_id, out)
    return out


async def _record_in_vault(farm_id: str, evaluation: dict[str, Any]) -> None:
    """Best effort: a vault failure is logged and never fails the evaluation."""
    settings = get_settings()
    if settings.agriquill_bridge_token is None:
        return
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(
                f"{settings.agriquill_api_url}/api/v1/agriquill/farms/{farm_id}/vault/council",
                json={"evaluation": evaluation, "sent_by": settings.agriquill_bridge_reporter},
                headers={
                    "X-AgriQuill-Write-Token": settings.agriquill_bridge_token.get_secret_value()
                },
            )
            response.raise_for_status()
    except httpx.HTTPError:
        logger.warning("AgriQill council record failed for farm %s", farm_id, exc_info=True)


@router.post("/ping", status_code=status.HTTP_200_OK, summary="Test LLM provider connection")
async def ping_llm_provider(req: ProviderPingRequest) -> dict[str, Any]:
    cfg = ProviderConfig(
        provider=req.provider,
        endpoint=req.endpoint,
        api_key=req.api_key,
        model=req.model,
    )
    return await ping_provider(cfg)


@router.post("/chat", summary="Stream chat with Alpha, Lou, or Qill")
async def chat_with_persona(req: PersonaChatRequest):
    cfg = None
    if req.provider_config:
        cfg = ProviderConfig(
            provider=req.provider_config.provider,
            endpoint=req.provider_config.endpoint,
            api_key=req.provider_config.api_key,
            model=req.provider_config.model,
        )

    # Tailored persona system prompts grounded in REA and domain facts
    if req.agent_id == SubAgentId.ALPHA:
        system_prompt = (
            "You are Alpha, a traditional generational farmer representing Agricultural mastery in AgroGuard. "
            "You have inherited decades of soil intuition. You believe AI and sensors cannot replace honest field grit, "
            "sharp eyes, and patience. You are cautious with chemical inputs, skeptical of tech hype, and prioritize "
            "hands-on field walks (checking soil feel, leaf dew, stem strength). Speak with earthy wisdom, direct advice, "
            "and deep respect for the land. Focus on pre-harvest agricultural physics for " + req.crop + ". Never hallucinate numbers."
        )
    elif req.agent_id == SubAgentId.LOU:
        system_prompt = (
            "You are Lou, a smart tech-lover farmer representing Tech AI in AgroGuard. "
            "You actively invest in sensors, drones, satellite NDVI, and automated irrigation. You believe precision data "
            "beats guesswork every time. You provide quantitative, model-driven recommendations, but acknowledge that "
            "sensors can drift and over-investing is a risk. Speak with high energy, analytical precision, and data-backed "
            "confidence about pre-harvest optimization for " + req.crop + ". Never hallucinate numbers."
        )
    else:
        system_prompt = (
            "You are Qill, a pragmatic market realist representing Business & Community in AgroGuard. "
            "You test new solutions rapidly: if it works and proves profitable, you keep it; if not, you scrap it. "
            "You care deeply about export standards (EU/China organic compliance, pesticide MRLs), milling broken %, "
            "diesel pumping expenses, and combine harvester contracting. Speak crisply, strategically, and with an eye on "
            "ROI and community impact for " + req.crop + ". Never hallucinate numbers."
        )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": req.message},
    ]

    async def event_stream():
        async for chunk in stream_provider_chat(messages, cfg):
            yield f"data: {json.dumps({'content': chunk, 'done': False})}\n\n"
        yield f"data: {json.dumps({'content': '', 'done': True})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
