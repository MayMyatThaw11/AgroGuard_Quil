import json
from pathlib import Path
import torch
import torch.nn.functional as F
from torchvision import models, transforms
from PIL import Image

MODELS_DIR = Path(r"C:\Users\Thant Zin Moe\Desktop\Gintama\Ai-Youth_Festa_2026\YOLO_plant_disease_detection\trained_models")

# Map each user-selectable crop to its Group folder and class prefix(es)
CROP_TO_GROUP_MAP = {
    # Group 1
    "Rice": ("Group_1_Grains_Legumes_Oilseeds", ["Rice___"]),
    "Corn": ("Group_1_Grains_Legumes_Oilseeds", ["Corn___"]),
    "Soybean": ("Group_1_Grains_Legumes_Oilseeds", ["Soybean___"]),
    "Peanut": ("Group_1_Grains_Legumes_Oilseeds", ["Peanut___"]),
    "Sesame": ("Group_1_Grains_Legumes_Oilseeds", ["Sesame___"]),
    # Group 2
    "Coconut": ("Group_2_Palms_Industrial_Trees", ["Coconut___"]),
    "Oil Palm": ("Group_2_Palms_Industrial_Trees", ["Oil_Palm___"]),
    "Rubber": ("Group_2_Palms_Industrial_Trees", ["Rubber___"]),
    "Cashew": ("Group_2_Palms_Industrial_Trees", ["Cashew___"]),
    "Black Pepper": ("Group_2_Palms_Industrial_Trees", ["Black_Pepper___"]),
    # Group 3
    "Cassava": ("Group_3_Beverage_Sugar_Root_Crops", ["Cassava___"]),
    "Coffee": ("Group_3_Beverage_Sugar_Root_Crops", ["Coffee___"]),
    "Sugarcane": ("Group_3_Beverage_Sugar_Root_Crops", ["Sugarcane___"]),
    "Tea": ("Group_3_Beverage_Sugar_Root_Crops", ["Tea___"]),
    "Cacao": ("Group_3_Beverage_Sugar_Root_Crops", ["Cacao___"]),
    # Group 4 (Mango checks both Leaf & Fruit automatically!)
    "Banana": ("Group_4_Orchard_Tree_Fruits", ["Banana___"]),
    "Durian": ("Group_4_Orchard_Tree_Fruits", ["Durian___"]),
    "Mango": ("Group_4_Orchard_Tree_Fruits", ["Mango_Leaf___", "Mango_Fruit___"]),
    "Papaya": ("Group_4_Orchard_Tree_Fruits", ["Papaya___"]),
    "Dragon Fruit": ("Group_4_Orchard_Tree_Fruits", ["Dragon_Fruit___"]),
    # Group 5 (Tomato & Pepper/Chili check both Leaf & Fruit automatically!)
    "Eggplant": ("Group_5_Vegetables_Vine_Fruits", ["Eggplant___"]),
    "Pepper / Chili": ("Group_5_Vegetables_Vine_Fruits", ["Pepper_Leaf___", "Pepper_Fruit___", "Chili_Leaf___", "Chili_Fruit___"]),
    "Tomato": ("Group_5_Vegetables_Vine_Fruits", ["Tomato_Leaf___", "Tomato_Fruit___"]),
    "Pineapple": ("Group_5_Vegetables_Vine_Fruits", ["Pineapple___"]),
    "Watermelon": ("Group_5_Vegetables_Vine_Fruits", ["Watermelon___"]),
}


def predict_disease(selected_crop: str, image_path: str):
    if selected_crop not in CROP_TO_GROUP_MAP:
        raise ValueError(f"Unknown crop '{selected_crop}'. Choose from: {list(CROP_TO_GROUP_MAP.keys())}")

    group_name, valid_prefixes = CROP_TO_GROUP_MAP[selected_crop]
    group_model_dir = MODELS_DIR / group_name

    with open(group_model_dir / "class_names.json", "r", encoding="utf-8") as f:
        class_names = json.load(f)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = models.mobilenet_v3_large(weights=None)
    model.classifier[3] = torch.nn.Linear(model.classifier[3].in_features, len(class_names))
    model.load_state_dict(torch.load(group_model_dir / "best_model.pth", map_location=device, weights_only=True))
    model.to(device).eval()

    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    img = Image.open(image_path).convert("RGB")
    input_tensor = transform(img).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = model(input_tensor)[0]

        # Mask out unrelated crops in the same group (keep only selected crop + 00_Background_Non_Plant)
        for idx, c_name in enumerate(class_names):
            is_target_crop = any(c_name.startswith(prefix) for prefix in valid_prefixes)
            is_background = c_name == "00_Background_Non_Plant"
            if not (is_target_crop or is_background):
                logits[idx] = float("-inf")

        probs = F.softmax(logits, dim=0)
        top_prob, top_idx = torch.max(probs, dim=0)

    predicted_class = class_names[top_idx.item()]
    confidence = top_prob.item() * 100.0

    if predicted_class == "00_Background_Non_Plant":
        return {"status": "rejected", "message": "No valid plant/leaf detected in photo.", "confidence": round(confidence, 2)}

    return {
        "status": "success",
        "selected_crop": selected_crop,
        "group_model_used": group_name,
        "diagnosis": predicted_class,
        "confidence": round(confidence, 2),
    }


if __name__ == "__main__":
    # Example test call:
    # result = predict_disease(selected_crop="Mango", image_path=r"D:\test_leaf.jpg")
    # print(result)
    pass