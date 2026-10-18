from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from app.schemas.predict import PredictionResponse
from app.services.inference_service import inference_service
from app.services.translation_service import translation_service

router = APIRouter()

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
MAX_FILE_SIZE = 8 * 1024 * 1024


@router.post("/predict", response_model=PredictionResponse)
async def predict_disease_endpoint(
    file: UploadFile = File(...),
    group_id: str = Form(default="Group_3_Beverage_Sugar_Root_Crops"),
    crop_name: str = Form(default=""),
    language: str = Form(default=""),
    accept_language: str = Header(default="en"),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image format. Please upload a JPG, PNG, or WEBP image.",
        )

    image_bytes = await file.read()
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Image size exceeds the 8 MB limit.",
        )

    selected_lang = (language.strip() or accept_language.strip() or "en").lower()

    try:
        result = await inference_service.analyze_plant_image(
            image_bytes=image_bytes,
            group_id=group_id,
            crop_name=crop_name,
            language=selected_lang,
        )
        # Ensure all fields (including estimatedAffectedArea) are translated
        return translation_service.translate_prediction_details(result, selected_lang)
    except FileNotFoundError as fnf_err:
        raise HTTPException(status_code=500, detail=str(fnf_err))
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze the plant image: {str(exc)}",
        )