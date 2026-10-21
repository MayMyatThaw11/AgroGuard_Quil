from __future__ import annotations

import time
from typing import Any

# The trained models (RandomForest crop model) are AgroGuard's originally,
# vendored into agriquill/ml_models/ as a self-contained copy (see below).
# AgriQill surfaces them with input validation and latency. It reports no
# accuracy figure: the only data bundled is synthetic, so an accuracy measured on
# it would only show the model matching the tables that made the data.
try:  # own copy of AgroGuard's trained artifacts — kept self-contained so
    # AgriQill doesn't depend on AgroGuard's backend being present (they're
    # two independently deployable processes; see docs/RECONCILIATION.md).
    from agriquill.ml_models.crop_predictor import predict_crop as _crop_predict
    from agriquill.ml_models.crop_predictor import predict_crops as _predict_crops
    from agriquill.ml_models.plant_recommender import recommend_crops as _recommend_crops

    _ML_AVAILABLE = True
except Exception as exc:  # artifact missing or incompatible env
    _ML_AVAILABLE = False
    _ML_ERROR = str(exc)

# Shown with every prediction. held_out_accuracy stays null until the model is
# scored on real field outcomes, by township, and never holds a synthetic figure.
VALIDATION = {
    "held_out_accuracy": None,
    "validated_on_field_data": False,
    "reason": (
        "Not measured yet. The bundled training rows are synthetic, so any accuracy "
        "computed on them would only mirror the tables that generated them."
    ),
}


def available() -> tuple[bool, str | None]:
    if _ML_AVAILABLE:
        return True, None
    return False, f"ML artifacts unavailable: {_ML_ERROR}"


def _bounded(name: str, value: float, lo: float, hi: float) -> float:
    if not isinstance(value, (int, float)) or value != value or not (lo <= value <= hi):
        raise ValueError(f"{name} must be a finite number in [{lo}, {hi}]")
    return float(value)


def crop_predict(soil_ph: float, rainfall_mm: float, temperature_c: float) -> dict[str, Any]:
    if not _ML_AVAILABLE:
        raise RuntimeError(_ML_ERROR)
    soil_ph = _bounded("soil_ph", soil_ph, 0.0, 14.0)
    rainfall_mm = _bounded("rainfall_mm", rainfall_mm, 0.0, 20000.0)
    temperature_c = _bounded("temperature_c", temperature_c, -20.0, 60.0)
    started = time.perf_counter()
    crop, confidence = _crop_predict(soil_ph, rainfall_mm, temperature_c)
    alternatives = _predict_crops(soil_ph, rainfall_mm, temperature_c)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    return {
        "crop": crop,
        "confidence_percent": confidence,
        "alternatives": [{"crop": c, "score": s} for c, s in alternatives],
        "validation": VALIDATION,
        "measured_latency_ms": elapsed_ms,
    }


def plant_recommend(
    soil_ph: float, rainfall_mm: float, temperature_c: float, limit: int = 3
) -> dict[str, Any]:
    if not _ML_AVAILABLE:
        raise RuntimeError(_ML_ERROR)
    soil_ph = _bounded("soil_ph", soil_ph, 0.0, 14.0)
    rainfall_mm = _bounded("rainfall_mm", rainfall_mm, 0.0, 20000.0)
    temperature_c = _bounded("temperature_c", temperature_c, -20.0, 60.0)
    started = time.perf_counter()
    items = _recommend_crops(soil_ph, rainfall_mm, temperature_c, limit=max(1, min(limit, 10)))
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    return {
        "recommendations": items,
        "validation": VALIDATION,
        "measured_latency_ms": elapsed_ms,
    }
