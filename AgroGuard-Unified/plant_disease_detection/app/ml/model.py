import json
from io import BytesIO
from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np
from PIL import Image
import torch
import torch.nn.functional as F

from app.ml.disease_data import CROP_PREFIX_MAP

# Project root directory (YOLO_plant_disease)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

VALID_GROUPS = [
    "Group_1_Grains_Legumes_Oilseeds",
    "Group_2_Palms_Industrial_Trees",
    "Group_3_Beverage_Sugar_Root_Crops",
    "Group_4_Orchard_Tree_Fruits",
    "Group_5_Vegetables_Vine_Fruits",
]


class GroupModelManager:
    """Loads and caches the 5 modular Plant Group models (YOLO .pt or PyTorch .pth)."""

    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.loaded_models: Dict[str, Dict[str, Any]] = {}

    def _find_group_weights(self, group_id: str) -> Dict[str, Optional[Path]]:
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

        pytorch_candidates = [
            BASE_DIR / "trained_models" / group_id / "best_model.pth",
            BASE_DIR / "4_trained_models" / group_id / "best_model.pth",
            BASE_DIR / "app" / "ml" / "weights" / group_id / "best_model.pth",
        ]
        for pth_path in pytorch_candidates:
            if pth_path.exists():
                classes_json = pth_path.parent / "class_names.json"
                return {"type": "pytorch", "weights": pth_path, "classes": classes_json}

        raise FileNotFoundError(
            f"Could not find trained weights for '{group_id}'. "
            f"Place '{group_id}/weights/best.pt' or '{group_id}/best_model.pth' inside 'trained_models/'."
        )

    def get_model(self, group_id: str) -> Dict[str, Any]:
        if group_id in self.loaded_models:
            return self.loaded_models[group_id]

        info = self._find_group_weights(group_id)

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
        else:
            from torchvision import models, transforms

            with open(info["classes"], "r", encoding="utf-8") as f:
                class_names = json.load(f)

            pt_model = models.mobilenet_v3_large(weights=None)
            in_features = pt_model.classifier[3].in_features
            pt_model.classifier[3] = torch.nn.Linear(in_features, len(class_names))
            pt_model.load_state_dict(
                torch.load(info["weights"], map_location=self.device, weights_only=True)
            )
            pt_model.to(self.device).eval()

            transform = transforms.Compose([
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ])
            bundle = {
                "type": "pytorch",
                "model": pt_model,
                "class_names": class_names,
                "transform": transform,
            }

        self.loaded_models[group_id] = bundle
        return bundle

    def predict(
        self, image_bytes: bytes, group_id: str, crop_name: str = ""
    ) -> Dict[str, Any]:
        if group_id not in VALID_GROUPS:
            raise ValueError(f"Invalid group_id '{group_id}'. Must be one of {VALID_GROUPS}")

        bundle = self.get_model(group_id)
        class_names: List[str] = bundle["class_names"]
        img = Image.open(BytesIO(image_bytes)).convert("RGB")

        # 1. Obtain raw probability distribution across all classes in the Group
        if bundle["type"] == "yolo":
            results = bundle["model"].predict(img, imgsz=224, verbose=False)
            probs = results[0].probs.data.cpu().numpy().copy()
        else:
            tensor = bundle["transform"](img).unsqueeze(0).to(self.device)
            with torch.no_grad():
                logits = bundle["model"](tensor)[0]
                probs = F.softmax(logits, dim=0).cpu().numpy().copy()

        # 2. Optional Crop Prefix Filtering (if user clicked a specific crop pill in the UI)
        valid_prefixes = CROP_PREFIX_MAP.get(crop_name.strip(), [])
        if valid_prefixes:
            mask = np.zeros_like(probs, dtype=bool)
            for idx, c_name in enumerate(class_names):
                is_target_crop = any(
                    c_name.lower().startswith(p.lower()) for p in valid_prefixes
                )
                is_bg = c_name == "00_Background_Non_Plant" or "not_a_plant" in c_name.lower()
                if is_target_crop or is_bg:
                    mask[idx] = True

            # Apply mask if at least one matching class exists in this group
            if np.any(mask):
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