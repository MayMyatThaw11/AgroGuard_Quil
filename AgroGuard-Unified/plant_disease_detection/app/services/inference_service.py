from app.ml.model import model_manager
from app.ml.disease_data import build_agronomic_details
from app.schemas.predict import PredictionResponse
from app.services.translation_service import translation_service


class InferenceService:
    @staticmethod
    async def analyze_plant_image(
        image_bytes: bytes,
        group_id: str,
        crop_name: str = "",
        language: str = "en",
    ) -> PredictionResponse:
        # 1. Run inference on the selected Group model
        raw_pred = model_manager.predict(
            image_bytes=image_bytes,
            group_id=group_id,
            crop_name=crop_name,
        )

        # 2. Generate base English agronomic details
        details = build_agronomic_details(
            raw_class_name=raw_pred["raw_class_name"],
            confidence=raw_pred["confidence"],
        )

        # 3. Translate fields if Accept-Language is not 'en' (e.g., 'my' or 'mm')
        details = translation_service.translate_prediction_details(
            details=details,
            raw_language=language,
        )

        return PredictionResponse(
            **details,
            groupUsed=raw_pred["group_used"],
            rawClassName=raw_pred["raw_class_name"],
        )


inference_service = InferenceService()