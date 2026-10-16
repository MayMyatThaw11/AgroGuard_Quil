from __future__ import annotations

import time
from typing import Any

# The trained models (RandomForest crop model) are AgroGuard's originally,
# vendored into agriquill/ml_models/ as a self-contained copy (see below).
# AgriQill surfaces them with input validation, latency, and an explicit
# accuracy note. Accuracy figures are computed on the bundled synthetic
# township dataset and are NOT a field-validated estimate; the Beta design
# target remains 95-98% and is marked TO VERIFY.
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

# Held-out accuracy of the RandomForest crop model on the bundled synthetic
# township CSV split (200 rows) is 1.0. Marked synthetic, not field-validated.
CROP_MODEL_HELDOUT_ACCURACY_SYNTHETIC = 1.0
ACCURACY_DESIGN_TARGET = "95-98% (design target, TO VERIFY on field data)"


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
        "heldout_accuracy_on_bundled_synthetic_dataset": CROP_MODEL_HELDOUT_ACCURACY_SYNTHETIC,
        "accuracy_design_target": ACCURACY_DESIGN_TARGET,
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
        "accuracy_design_target": ACCURACY_DESIGN_TARGET,
        "measured_latency_ms": elapsed_ms,
    }
