import json
from io import BytesIO
from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np
from PIL import Image

from app.ml.disease_data import (
    CROP_PREFIX_MAP,
    GROUP_CROPS,
    crop_matches,
    is_background_class,
    is_fruit_class,
)

# Project root directory (YOLO_plant_disease)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

VALID_GROUPS = [
    "Group_1_Grains_Legumes_Oilseeds",
    "Group_2_Palms_Industrial_Trees",
    "Group_3_Beverage_Sugar_Root_Crops",
    "Group_4_Orchard_Tree_Fruits",
    "Group_5_Vegetables_Vine_Fruits",
]

# Same preprocessing as 1_scripts/train_pytorch_groups.py (Resize 224, ImageNet normalisation).
IMG_SIZE = 224
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class ModelUnavailableError(Exception):
    """The group has no trained weights in this workspace yet."""


class GroupModelManager:
    """Loads and caches the 5 modular Plant Group models (YOLO .pt, PyTorch .pth or ONNX)."""

    def __init__(self):
        self.loaded_models: Dict[str, Dict[str, Any]] = {}

    def _group_folders(self, group_id: str) -> List[Path]:
        return [
            BASE_DIR / "trained_models" / group_id,
            BASE_DIR / "4_trained_models" / group_id,
            BASE_DIR / "app" / "ml" / "weights" / group_id,
        ]

    def _find_group_weights(self, group_id: str) -> Optional[Dict[str, Any]]:
        """Searches standard directories in your workspace for the group's trained weights."""
        yolo_candidates = [
            BASE_DIR / "trained_models" / group_id / "weights" / "best.pt",
            BASE_DIR / "trained_models" / f"{group_id}.pt",
            BASE_DIR / "runs" / "classify" / group_id / "weights" / "best.pt",
            BASE_DIR / "app" / "ml" / "weights" / f"{group_id}.pt",
            BASE_DIR / "weights" / f"{group_id}.pt",
        ]
        for pt_path in yolo_candidates:
            if pt_path.exists():
                return {"type": "yolo", "weights": pt_path, "classes": None}

        for folder in self._group_folders(group_id):
            if (folder / "best_model.pth").exists():
                return {"type": "pytorch", "weights": folder / "best_model.pth", "classes": folder / "class_names.json"}
        # train_pytorch_groups.py exports model.onnx next to best_model.pth; some
        # groups ship only the ONNX file.
        for folder in self._group_folders(group_id):
            if (folder / "model.onnx").exists():
                return {"type": "onnx", "weights": folder / "model.onnx", "classes": folder / "class_names.json"}
        return None

    def _class_names_file(self, group_id: str) -> Optional[Path]:
        for folder in self._group_folders(group_id):
            if (folder / "class_names.json").exists():
                return folder / "class_names.json"
        return None

    def get_model(self, group_id: str) -> Dict[str, Any]:
        if group_id in self.loaded_models:
            return self.loaded_models[group_id]

        info = self._find_group_weights(group_id)
        if info is None:
            raise ModelUnavailableError(
                f"The model for '{group_id}' is not trained yet. "
                f"Place '{group_id}/best_model.pth' or '{group_id}/model.onnx' inside 'trained_models/'."
            )

        if info["type"] == "yolo":
            from ultralytics import YOLO

            yolo_model = YOLO(str(info["weights"]))
            # Extract class names dictionary {0: 'ClassA', 1: 'ClassB', ...}
            names_dict = yolo_model.names
            class_names = [names_dict[i] for i in sorted(names_dict.keys())]
            bundle = {
                "type": "yolo",
                "model": yolo_model,
                "class_names": class_names,
            }
        elif info["type"] == "onnx":
            import onnxruntime as ort

            with open(info["classes"], "r", encoding="utf-8") as f:
                class_names = json.load(f)
            session = ort.InferenceSession(str(info["weights"]), providers=["CPUExecutionProvider"])
            bundle = {
                "type": "onnx",
                "model": session,
                "input_name": session.get_inputs()[0].name,
                "class_names": class_names,
            }
        else:
            import torch
            from torchvision import models, transforms

            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            with open(info["classes"], "r", encoding="utf-8") as f:
                class_names = json.load(f)

            pt_model = models.mobilenet_v3_large(weights=None)
            in_features = pt_model.classifier[3].in_features
            pt_model.classifier[3] = torch.nn.Linear(in_features, len(class_names))
            pt_model.load_state_dict(
                torch.load(info["weights"], map_location=device, weights_only=True)
            )
            pt_model.to(device).eval()

            transform = transforms.Compose([
                transforms.Resize((IMG_SIZE, IMG_SIZE)),
                transforms.ToTensor(),
                transforms.Normalize(IMAGENET_MEAN.tolist(), IMAGENET_STD.tolist()),
            ])
            bundle = {
                "type": "pytorch",
                "model": pt_model,
                "device": device,
                "class_names": class_names,
                "transform": transform,
            }

        self.loaded_models[group_id] = bundle
        return bundle

    def describe_groups(self) -> List[Dict[str, Any]]:
        """What each group can diagnose right now, for the frontend's group and crop buttons."""
        groups = []
        for group_id in VALID_GROUPS:
            classes_file = self._class_names_file(group_id)
            class_names: List[str] = []
            if classes_file:
                with open(classes_file, "r", encoding="utf-8") as f:
                    class_names = json.load(f)
            crops = []
            for crop in GROUP_CROPS[group_id]:
                matches = [c for c in class_names if crop_matches(c, crop)]
                if not matches:
                    continue
                has_fruit = any(is_fruit_class(c) for c in matches)
                has_leaf = any(not is_fruit_class(c) for c in matches)
                crops.append({"id": crop, "leafAndFruit": has_fruit and has_leaf})
            groups.append({
                "id": group_id,
                "available": self._find_group_weights(group_id) is not None,
                "crops": crops,
            })
        return groups

    def _probabilities(self, bundle: Dict[str, Any], img: Image.Image) -> np.ndarray:
        if bundle["type"] == "yolo":
            results = bundle["model"].predict(img, imgsz=IMG_SIZE, verbose=False)
            return results[0].probs.data.cpu().numpy().copy()

        if bundle["type"] == "onnx":
            resized = img.resize((IMG_SIZE, IMG_SIZE), Image.BILINEAR)
            arr = (np.asarray(resized, dtype=np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
            batch = arr.transpose(2, 0, 1)[np.newaxis].astype(np.float32)
            logits = bundle["model"].run(None, {bundle["input_name"]: batch})[0][0]
            exp = np.exp(logits - logits.max())
            return exp / exp.sum()

        import torch
        import torch.nn.functional as F

        tensor = bundle["transform"](img).unsqueeze(0).to(bundle["device"])
        with torch.no_grad():
            logits = bundle["model"](tensor)[0]
            return F.softmax(logits, dim=0).cpu().numpy().copy()

    def predict(
        self, image_bytes: bytes, group_id: str, crop_name: str = ""
    ) -> Dict[str, Any]:
        if group_id not in VALID_GROUPS:
            raise ValueError(f"Invalid group_id '{group_id}'. Must be one of {VALID_GROUPS}")

        crop_name = crop_name.strip()
        if crop_name and crop_name not in CROP_PREFIX_MAP:
            raise ValueError(f"Unknown crop '{crop_name}'.")

        bundle = self.get_model(group_id)
        class_names: List[str] = bundle["class_names"]
        if crop_name and not any(crop_matches(c, crop_name) for c in class_names):
            raise ValueError(f"The {group_id} model has no classes for '{crop_name}' yet.")

        img = Image.open(BytesIO(image_bytes)).convert("RGB")

        # 1. Obtain raw probability distribution across all classes in the Group
        probs = self._probabilities(bundle, img)

        # 2. Keep only the background class plus classes of the selected crop
        #    (a crop pill in the UI) or of the group's own crops (All Group Crops).
        crops = [crop_name] if crop_name else GROUP_CROPS[group_id]
        mask = np.array([
            is_background_class(c) or any(crop_matches(c, crop) for crop in crops)
            for c in class_names
        ])
        probs = np.where(mask, probs, 0.0)
        total_p = probs.sum()
        if total_p > 0:
            probs = probs / total_p

        top_idx = int(np.argmax(probs))
        top_confidence = float(probs[top_idx]) * 100.0
        predicted_class = class_names[top_idx]

        return {
            "group_used": group_id,
            "raw_class_name": predicted_class,
            "confidence": top_confidence,
        }


# Singleton instance used across requests
model_manager = GroupModelManager()
