"""Train the crop-suggestion models.

    python -m app.ml.training.train_model            # ASEAN Top-50 GaussianNB (primary)
    python -m app.ml.training.train_model --township # Myanmar township RandomForest
"""

import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.preprocessing import LabelEncoder

# Resolve paths relative to app/ml/
ML_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ML_DIR / "data"
ARTIFACTS_DIR = ML_DIR / "artifacts"

TRAINING_CSV = DATA_DIR / "ASEAN_Top50_Crop_Training_Data_Verified.csv"
RULES_CSV = DATA_DIR / "ASEAN_Top50_Crop_Rules_Cleaned.csv"
MODEL_PATH = ARTIFACTS_DIR / "asean_crop_gnb.joblib"

TOWNSHIP_CSV = ML_DIR.parent / "data" / "township_agricultural_data.csv"
TOWNSHIP_FEATURES = ["soil_pH", "rainfall_mm", "temperature_c"]


def train_and_save() -> None:
    print(f"Loading training data from {TRAINING_CSV}...")
    train_df = pd.read_csv(TRAINING_CSV, encoding="utf-8-sig")
    rules_df = pd.read_csv(RULES_CSV, encoding="utf-8-sig")

    feature_cols = ["ph", "rainfall", "temperature"]
    gnb_model = GaussianNB()
    gnb_model.fit(train_df[feature_cols], train_df["label"])

    # Save both the trained model and the biological rules dictionary
    artifact = {
        "model": gnb_model,
        "feature_cols": feature_cols,
        "rules_dict": rules_df.set_index("crop_name_en").to_dict(orient="index"),
    }

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, MODEL_PATH)
    print(f"Model successfully trained and saved to: {MODEL_PATH}")


def train_township() -> None:
    data = pd.read_csv(TOWNSHIP_CSV)
    encoder = LabelEncoder()
    labels = encoder.fit_transform(data["best_crop"])
    model = RandomForestClassifier(n_estimators=200, random_state=42)
    model.fit(data[TOWNSHIP_FEATURES], labels)

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, ARTIFACTS_DIR / "crop_model.joblib")
    joblib.dump(encoder, ARTIFACTS_DIR / "label_encoder.joblib")


if __name__ == "__main__":
    if "--township" in sys.argv:
        train_township()
    else:
        train_and_save()
