from fastapi import APIRouter, HTTPException, status

from app.schemas.water_irrigation import IrrigationEstimateRequest, IrrigationEstimateResponse
from app.services.water_irrigation import IrrigationValidationError, estimate_irrigation

router = APIRouter(tags=["water-irrigation"])


@router.post(
    "/water-irrigation/estimate",
    response_model=IrrigationEstimateResponse,
    status_code=status.HTTP_200_OK,
    summary="Stateless root-zone irrigation depth estimate from farmer-supplied, provenance-tagged inputs",
)
async def irrigation_estimate(request: IrrigationEstimateRequest) -> IrrigationEstimateResponse:
    try:
        return estimate_irrigation(request)
    except IrrigationValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
