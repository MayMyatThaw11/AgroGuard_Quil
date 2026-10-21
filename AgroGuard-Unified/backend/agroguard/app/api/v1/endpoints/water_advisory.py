from fastapi import APIRouter, status

from app.schemas.water_advisory import WaterAdvisoryRequest, WaterAdvisoryResponse
from app.services.water_advisory import evaluate_water_advisory

router = APIRouter(tags=["water-advisory"])


@router.post(
    "/water-advisory/evaluate",
    response_model=WaterAdvisoryResponse,
    status_code=status.HTTP_200_OK,
    summary=(
        "Advisory-only v2 irrigate/wait/monitor decision, built on the existing "
        "root-zone deficit calculator. Never actuates hardware; a new, additive "
        "endpoint that leaves /water-irrigation/estimate and all v1 behavior unchanged."
    ),
)
async def water_advisory_evaluate(request: WaterAdvisoryRequest) -> WaterAdvisoryResponse:
    return evaluate_water_advisory(request)
