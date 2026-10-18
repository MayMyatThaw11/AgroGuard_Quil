"""Crop prediction models.

Two models live here:

- ``CropPredictor`` / ``crop_predictor`` — the primary ASEAN Top-50 Gaussian
  Naive Bayes model (``artifacts/asean_crop_gnb.joblib``), filtered by each
  crop's absolute pH/rainfall/temperature survival bounds. This is what
  ``/crop-suggestion`` uses first.
- ``predict_crop`` / ``predict_crops`` — the original township RandomForest
  model (``crop_model.joblib`` + ``label_encoder.joblib``), kept as a
  secondary model for Myanmar township data.
"""

from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ML_DIR = Path(__file__).resolve().parent
ARTIFACT_DIR = ML_DIR / "artifacts"

# ── Primary: ASEAN Top-50 Gaussian Naive Bayes ─────────────────────────────

GNB_MODEL_PATH = ARTIFACT_DIR / "asean_crop_gnb.joblib"


class CropPredictor:
    def __init__(self):
        self._artifact = None

    def _load_model(self):
        if self._artifact is None:
            if not GNB_MODEL_PATH.exists():
                raise FileNotFoundError(
                    f"Trained model not found at {GNB_MODEL_PATH}. "
                    "Run `python -m app.ml.training.train_model` first."
                )
            self._artifact = joblib.load(GNB_MODEL_PATH)

    def recommend(self, ph: float, rainfall: float, temperature: float, top_k: int = 4) -> dict:
        self._load_model()
        model = self._artifact["model"]
        feature_cols = self._artifact["feature_cols"]
        rules_dict = self._artifact["rules_dict"]

        # 1. Run GaussianNB inference
        X_input = pd.DataFrame([[ph, rainfall, temperature]], columns=feature_cols)
        raw_probs = model.predict_proba(X_input)[0]
        classes = model.classes_

        # 2. Filter with biological survival bounds (Liebig's Law guardrail)
        viable_crops = []
        all_crops = []
        for crop_en, prob in zip(classes, raw_probs, strict=True):
            rule = rules_dict.get(crop_en)
            if not rule:
                continue

            item = {
                "crop_en": crop_en,
                "crop_mm": rule["crop_name_mm"],
                "scientific_name": rule["scientific_name"],
                "category": rule["category"],
                "raw_prob": float(prob),
            }
            all_crops.append(item)

            if (
                (rule["ph_abs_min"] <= ph <= rule["ph_abs_max"])
                and (rule["rain_abs_min"] <= rainfall <= rule["rain_abs_max"])
                and (rule["temp_abs_min"] <= temperature <= rule["temp_abs_max"])
            ):
                viable_crops.append(dict(item))

        # Fall back to top GaussianNB matches if the inputs are out of every crop's bounds
        target_list = viable_crops if viable_crops else all_crops

        # 3. Compute intuitive UI suitability percentage (scaled 15% - 98%)
        max_prob = max((c["raw_prob"] for c in target_list), default=0.0)
        for c in target_list:
            if max_prob > 0:
                relative_score = (c["raw_prob"] / max_prob) * 96.0
                c["confidence_pct"] = round(max(15.0, min(98.0, relative_score)), 1)
            else:
                c["confidence_pct"] = 50.0
            del c["raw_prob"]

        ranked = sorted(target_list, key=lambda x: x["confidence_pct"], reverse=True)[:top_k]

        return {
            "input": {"ph": ph, "rainfall": rainfall, "temperature": temperature},
            "total_viable_crops": len(viable_crops),
            "recommendations": ranked,
        }


# Singleton instance loaded once per backend worker
crop_predictor = CropPredictor()


# ── Secondary: Myanmar township RandomForest ───────────────────────────────

MODEL_PATH = ARTIFACT_DIR / "crop_model.joblib"
LABEL_ENCODER_PATH = ARTIFACT_DIR / "label_encoder.joblib"
FEATURE_NAMES = ["soil_pH", "rainfall_mm", "temperature_c"]
TRAINING_DATA_PATH = ML_DIR.parent / "data" / "township_agricultural_data.csv"


class CropModelUnavailableError(RuntimeError):
    """Raised when the crop model artifacts cannot be loaded."""


@lru_cache(maxsize=1)
def _load_artifacts():
    missing = [
        str(path)
        for path in (MODEL_PATH, LABEL_ENCODER_PATH)
        if not path.is_file()
    ]
    if missing:
        raise CropModelUnavailableError(
            f"Missing crop model artifact(s): {', '.join(missing)}"
        )

    try:
        return joblib.load(MODEL_PATH), joblib.load(LABEL_ENCODER_PATH)
    except Exception as exc:
        raise CropModelUnavailableError(
            "The crop model artifacts could not be loaded. "
            "Retrain them with this project's Python environment."
        ) from exc


def predict_crop(
    soil_ph: float,
    rainfall_mm: float,
    temperature_c: float,
) -> tuple[str, float]:
    model, label_encoder = _load_artifacts()
    features = pd.DataFrame(
        [[soil_ph, rainfall_mm, temperature_c]],
        columns=FEATURE_NAMES,
    )
    encoded_prediction = model.predict(features)
    crop = str(label_encoder.inverse_transform(encoded_prediction)[0])

    confidence = 1.0
    if hasattr(model, "predict_proba"):
        confidence = float(model.predict_proba(features)[0].max())

    return crop, round(confidence * 100, 1)


def predict_crops(
    soil_ph: float,
    rainfall_mm: float,
    temperature_c: float,
) -> list[tuple[str, float]]:
    _, label_encoder = _load_artifacts()
    try:
        training_data = pd.read_csv(TRAINING_DATA_PATH)
    except (OSError, ValueError) as exc:
        raise CropModelUnavailableError(
            f"Crop suitability data could not be loaded: {TRAINING_DATA_PATH}"
        ) from exc

    user_conditions = np.array([soil_ph, rainfall_mm, temperature_c], dtype=float)
    scales = training_data[FEATURE_NAMES].std().to_numpy()
    suitability: list[tuple[str, float]] = []

    for crop in label_encoder.classes_:
        crop_rows = training_data[training_data["best_crop"] == crop][FEATURE_NAMES]
        distances = np.linalg.norm(
            (crop_rows.to_numpy() - user_conditions) / scales,
            axis=1,
        )
        nearest_distance = float(np.sort(distances)[:10].mean())
        score = max(0, min(99, 99 * np.exp(-0.2 * nearest_distance)))
        suitability.append((str(crop), round(float(score), 1)))

    return sorted(suitability, key=lambda item: item[1], reverse=True)[:2]
