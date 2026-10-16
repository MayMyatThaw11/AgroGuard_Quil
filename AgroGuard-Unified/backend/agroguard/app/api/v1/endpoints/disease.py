import logging
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from app.schemas.disease import DiseaseDetectionResponse
from app.services.llm import get_disease_advice

logger = logging.getLogger(__name__)

try:
    from app.ml.disease_detection import predict_image
except ImportError:
    predict_image = None
    logger.warning("Disease detection model dependencies (torch/torchvision) are not installed.")

router = APIRouter(tags=["disease-detection"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 8 * 1024 * 1024


@router.post(
    "/disease-detect",
    response_model=DiseaseDetectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Detect plant disease from an image",
)
async def disease_detect(
    file: UploadFile,
    accept_language: Annotated[str | None, Header()] = "en",
):
    language = "my" if accept_language and "my" in accept_language.lower() else "en"

    if file.content_type not in ALLOWED_TYPES:
        return DiseaseDetectionResponse(
            plantName="",
            scientificName="",
            healthStatus="Invalid file type. Please upload JPG, PNG, or WEBP.",
            healthScore=0,
            detectedDisease="",
            confidenceScore=0,
            diseaseSeverity="",
            estimatedAffectedArea="",
            visibleSymptoms=[],
            possibleCauses=[],
            treatmentRecommendations=["Upload a valid image file."],
            preventionRecommendations=[],
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        return DiseaseDetectionResponse(
            plantName="",
            scientificName="",
            healthStatus="File too large. Maximum size is 8 MB.",
            healthScore=0,
            detectedDisease="",
            confidenceScore=0,
            diseaseSeverity="",
            estimatedAffectedArea="",
            visibleSymptoms=[],
            possibleCauses=[],
            treatmentRecommendations=["Choose a smaller image."],
            preventionRecommendations=[],
        )

    result = await _analyze_image(contents, file.content_type, language)
    return DiseaseDetectionResponse(**result)


async def _analyze_image(image_bytes: bytes, content_type: str, language: str) -> dict:
    if predict_image is None:
        raise HTTPException(
            status_code=503,
            detail="Machine learning models are not available. Install torch/torchvision and provide a trained model.",
        )

    try:
        # CPU-bound inference runs in a threadpool so it doesn't block the event loop.
        prediction = await run_in_threadpool(predict_image, image_bytes)
    except Exception as exc:
        logger.exception("Disease detection inference failed")
        raise HTTPException(status_code=500, detail=f"Error analyzing image: {exc}") from exc

    is_healthy = prediction.get("is_healthy", False)
    plant_name = prediction.get("plant", "Unknown Plant")
    disease_name = prediction.get("disease", "Unknown Disease")
    confidence = prediction.get("confidence", 0)

    advice = await get_disease_advice(
        plant=plant_name,
        disease=disease_name,
        is_healthy=is_healthy,
        language=language,
    )

    return {
        "plantName": plant_name,
        "scientificName": f"{plant_name} sp.",
        "healthStatus": "Healthy" if is_healthy else "Disease Detected",
        "healthScore": int(confidence) if is_healthy else max(0, 100 - int(confidence)),
        "detectedDisease": "None" if is_healthy else disease_name,
        "confidenceScore": int(confidence),
        "diseaseSeverity": "None" if is_healthy else "Moderate",
        "estimatedAffectedArea": "0%" if is_healthy else "Varies",
        "visibleSymptoms": advice.get("visibleSymptoms", []),
        "possibleCauses": advice.get("possibleCauses", []),
        "treatmentRecommendations": advice.get("treatmentRecommendations", []),
        "preventionRecommendations": advice.get("preventionRecommendations", []),
    }
