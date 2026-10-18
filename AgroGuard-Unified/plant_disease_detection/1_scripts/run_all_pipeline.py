import hashlib
import random
import shutil
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageFile
import imagehash
from tqdm import tqdm

ImageFile.LOAD_TRUNCATED_IMAGES = False

# =====================================================================
# ONLY EDIT THESE TWO PATHS:
# 1. RAW_ROOT: The folder containing your 121 downloaded folders
# 2. PROJECT_ROOT: Where you want Group_1 to Group_5 created
# =====================================================================
RAW_ROOT = Path(r"C:\Users\Thant Zin Moe\Desktop\Gintama\Ai-Youth_Festa_2026\YOLO_plant_disease_detection\new dataset\train")
PROJECT_ROOT = Path(r"C:\Users\Thant Zin Moe\Desktop\Gintama\Ai-Youth_Festa_2026\YOLO_plant_disease_detection\plants_datasets")
# =====================================================================

STAGING_DIR = PROJECT_ROOT / "_merged_staging"
CLEAN_NON_PLANT_DIR = STAGING_DIR / "00_Background_Non_Plant_Clean"
QUARANTINE_DIR = STAGING_DIR / "_quarantine_Not_A_Plant"

TARGET_SIZE = (384, 384)
MIN_DIM = 100
MIN_STD_DEV = 12.0
BLUR_LAPLACIAN_THRESHOLD = 55.0
DHASH_THRESHOLD = 4
GREEN_RATIO_LIMIT = 0.45
SPLIT_RATIOS = (0.80, 0.10, 0.10)
MAX_NON_PLANT_PER_GROUP = 800
VALID_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff"}


# ---------------- STEP 1: CLEAN NOT_A_PLANT ----------------
def is_leaf_green_dominant(img_rgb: Image.Image) -> bool:
    small = img_rgb.resize((128, 128))
    arr = np.asarray(small, dtype=np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    exg_mask = ((2 * g - r - b) > 25) & (g > r * 1.10) & (g > b * 1.15) & (g > 40)
    return float(np.mean(exg_mask)) > GREEN_RATIO_LIMIT


def step1_clean_not_a_plant():
    print("\n================ STEP 1: CLEANING NOT_A_PLANT ================")
    src_dir = RAW_ROOT / "Not_A_Plant"
    if not src_dir.exists():
        print(f"  [WARNING] '{src_dir}' not found! Skipping Step 1.")
        return

    CLEAN_NON_PLANT_DIR.mkdir(parents=True, exist_ok=True)
    QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
    all_files = [p for p in src_dir.rglob("*") if p.is_file()]
    seen_hashes = []
    kept = 0

    for file_path in tqdm(all_files, desc="Cleaning Not_A_Plant"):
        if file_path.suffix.lower() not in VALID_EXTS:
            continue
        try:
            with Image.open(file_path) as img:
                img.verify()
            with Image.open(file_path) as img:
                img_rgb = img.convert("RGB")
                w, h = img_rgb.size
                if w < MIN_DIM or h < MIN_DIM or (max(w, h) / max(1, min(w, h))) > 4.0:
                    continue
                if np.std(np.asarray(img_rgb)) < MIN_STD_DEV:
                    continue
                curr_hash = imagehash.dhash(img_rgb)
                if any((curr_hash - sh) <= DHASH_THRESHOLD for sh in seen_hashes):
                    continue
                seen_hashes.append(curr_hash)
                if is_leaf_green_dominant(img_rgb):
                    q_dir = QUARANTINE_DIR / "possible_plant_contamination"
                    q_dir.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(file_path, q_dir / file_path.name)
                    continue

                img_rgb.thumbnail(TARGET_SIZE, Image.Resampling.LANCZOS)
                img_rgb.save(CLEAN_NON_PLANT_DIR / f"non_plant_{kept:05d}.jpg", "JPEG", quality=92)
                kept += 1
        except Exception:
            continue
    print(f"  -> Saved {kept} clean non-plant images to '{CLEAN_NON_PLANT_DIR}'.")


# ---------------- STEP 2: AUDIT & MERGE DUPLICATES ----------------
def get_folder_md5_set(folder: Path) -> set:
    hashes = set()
    if not folder.exists():
        return hashes
    for p in folder.iterdir():
        if p.is_file() and p.suffix.lower() in VALID_EXTS:
            hashes.add(hashlib.md5(p.read_bytes()).hexdigest())
    return hashes


def step2_audit_and_merge():
    print("\n================ STEP 2: AUDITING & MERGING ================")
    # 1. Audit Eggplant Healthy Leaf (1-7)
    base_folder = RAW_ROOT / "Eggplant Healthy Leaf"
    base_hashes = get_folder_md5_set(base_folder)
    print(f"Base 'Eggplant Healthy Leaf': {len(base_hashes)} images")
    for i in range(2, 8):
        f = RAW_ROOT / f"Eggplant Healthy Leaf ({i})"
        if not f.exists():
            continue
        f_hashes = get_folder_md5_set(f)
        overlap_pct = (len(base_hashes.intersection(f_hashes)) / max(1, len(f_hashes))) * 100
        status = "DUPLICATE (Safe to ignore)" if overlap_pct > 80 else "DISTINCT CLASS (Check images!)"
        print(f"  -> '{f.name}': {overlap_pct:.1f}% overlap [{status}]")

    # 2. Merge Rice Brown Spot
    out_rice = STAGING_DIR / "Rice_Brown_Spot_Merged"
    out_rice.mkdir(parents=True, exist_ok=True)
    seen_dhashes = []
    kept_rice = 0
    for folder_name in ["Rice Browon Spot", "rice_Brown spot"]:
        src = RAW_ROOT / folder_name
        if not src.exists():
            continue
        for p in src.iterdir():
            if p.is_file() and p.suffix.lower() in VALID_EXTS:
                try:
                    with Image.open(p) as img:
                        h = imagehash.dhash(img.convert("RGB"))
                    if not any((h - sh) <= DHASH_THRESHOLD for sh in seen_dhashes):
                        seen_dhashes.append(h)
                        shutil.copy2(p, out_rice / f"rice_brown_spot_{kept_rice:05d}{p.suffix.lower()}")
                        kept_rice += 1
                except Exception:
                    continue
    print(f"  -> Merged Rice Brown Spot: {kept_rice} unique images.")

    # 3. Build Durian Healthy from 8 cultivar folders
    durian_folders = [
        "durian chani", "durian kanyao", "durian longL", "durian med",
        "durian moanthong", "durian nokyib", "durian salika", "durian thongY"
    ]
    out_durian = STAGING_DIR / "Durian_Healthy_Merged"
    out_durian.mkdir(parents=True, exist_ok=True)
    random.seed(42)
    kept_durian = 0
    for d_name in durian_folders:
        src = RAW_ROOT / d_name
        if not src.exists():
            continue
        files = [p for p in src.iterdir() if p.is_file() and p.suffix.lower() in VALID_EXTS]
        for p in random.sample(files, min(150, len(files))):
            shutil.copy2(p, out_durian / f"durian_healthy_{kept_durian:05d}{p.suffix.lower()}")
            kept_durian += 1
    print(f"  -> Created Durian___Healthy with {kept_durian} images.")


# ---------------- STEP 3: CLEAN, RESIZE & SPLIT INTO 5 GROUPS ----------------
FOLDER_MAPPING = {
    # GROUP 1
    ("Group_1_Grains_Legumes_Oilseeds", "Corn___Cercospora_Gray_Leaf_Spot"): "Corn_(maize)___Cercospora_leaf_spot",
    ("Group_1_Grains_Legumes_Oilseeds", "Corn___Common_Rust"): "Corn_(maize)___Common_rust_",
    ("Group_1_Grains_Legumes_Oilseeds", "Corn___Northern_Leaf_Blight"): "Corn_(maize)___Northern_Leaf_Blight",
    ("Group_1_Grains_Legumes_Oilseeds", "Corn___Healthy"): "Corn_(maize)___healthy",
    ("Group_1_Grains_Legumes_Oilseeds", "Rice___Bacterial_Leaf_Blight"): "rice_Bacterial leaf blight",
    ("Group_1_Grains_Legumes_Oilseeds", "Rice___Rice_Blast"): "Rice Blast",
    ("Group_1_Grains_Legumes_Oilseeds", "Rice___Brown_Spot"): "_merged_staging/Rice_Brown_Spot_Merged",
    ("Group_1_Grains_Legumes_Oilseeds", "Rice___Sheath_Blight"): "Rice Sheath Blight",
    ("Group_1_Grains_Legumes_Oilseeds", "Rice___Tungro_Virus"): "Rice Turgro",
    ("Group_1_Grains_Legumes_Oilseeds", "Rice___Leaf_Scald"): "Leaf Scaled",
    ("Group_1_Grains_Legumes_Oilseeds", "Rice___Leaf_Smut"): "rice_Leaf smut",
    ("Group_1_Grains_Legumes_Oilseeds", "Rice___Healthy"): "rice_healthy",
    ("Group_1_Grains_Legumes_Oilseeds", "Soybean___Healthy"): "Soybean___healthy",
    # GROUP 2
    ("Group_2_Palms_Industrial_Trees", "Coconut___Bud_Root_Dropping"): "coconut_Bud Root Dropping",
    ("Group_2_Palms_Industrial_Trees", "Coconut___Bud_Rot"): "coconut_Bud Rot",
    ("Group_2_Palms_Industrial_Trees", "Coconut___Gray_Leaf_Spot"): "coconut_Gray Leaf Spot",
    ("Group_2_Palms_Industrial_Trees", "Coconut___Leaf_Rot"): "coconut_Leaf Rot",
    ("Group_2_Palms_Industrial_Trees", "Coconut___Healthy"): "coconut_healthy",
    # GROUP 3
    ("Group_3_Beverage_Sugar_Root_Crops", "Cassava___Bacterial_Blight"): "Cassava Bacterial light",
    ("Group_3_Beverage_Sugar_Root_Crops", "Cassava___Brown_Streak_Disease"): "Cassava Brown Streak Disease",
    ("Group_3_Beverage_Sugar_Root_Crops", "Cassava___Green_Mottle"): "Cassava Green mottle",
    ("Group_3_Beverage_Sugar_Root_Crops", "Cassava___Healthy"): "Cassava Healthy",
    ("Group_3_Beverage_Sugar_Root_Crops", "Coffee___Leaf_Rust"): "coffee___rust",
    ("Group_3_Beverage_Sugar_Root_Crops", "Coffee___Red_Spider_Mite"): "coffee___red_spider_mite",
    ("Group_3_Beverage_Sugar_Root_Crops", "Coffee___Healthy"): "coffee___healthy",
    ("Group_3_Beverage_Sugar_Root_Crops", "Sugarcane___Mosaic_Virus"): "Sugarcane Mosaic",
    ("Group_3_Beverage_Sugar_Root_Crops", "Sugarcane___Red_Rot"): "Sugarcane RedRot",
    ("Group_3_Beverage_Sugar_Root_Crops", "Sugarcane___Rust"): "Sugarcane Rust",
    ("Group_3_Beverage_Sugar_Root_Crops", "Sugarcane___Yellow_Leaf_Disease"): "Sugarcane Yellow",
    ("Group_3_Beverage_Sugar_Root_Crops", "Sugarcane___Healthy"): "Sugarcane Healthy",
    ("Group_3_Beverage_Sugar_Root_Crops", "Tea___Anthracnose"): "Tea Anthracnose",
    ("Group_3_Beverage_Sugar_Root_Crops", "Tea___Bird_Eye_Spot"): "Tea bird eye spot",
    ("Group_3_Beverage_Sugar_Root_Crops", "Tea___Brown_Blight"): "Tea brown blight",
    ("Group_3_Beverage_Sugar_Root_Crops", "Tea___Gray_Blight"): "Tea gray light",
    ("Group_3_Beverage_Sugar_Root_Crops", "Tea___Red_Leaf_Spot"): "Tea red leaf spot",
    ("Group_3_Beverage_Sugar_Root_Crops", "Tea___Algal_Leaf_Spot"): "Tea Tea algal leaf",
    ("Group_3_Beverage_Sugar_Root_Crops", "Tea___White_Spot"): "Tea white spot",
    ("Group_3_Beverage_Sugar_Root_Crops", "Tea___Healthy"): "Tea healthy",
    # GROUP 4
    ("Group_4_Orchard_Tree_Fruits", "Banana___Cordana_Leaf_Spot"): "banana_cordana",
    ("Group_4_Orchard_Tree_Fruits", "Banana___Pestalotiopsis_Leaf_Blight"): "banana_pestalotiopsis",
    ("Group_4_Orchard_Tree_Fruits", "Banana___Black_Sigatoka"): "banana_sigatoka",
    ("Group_4_Orchard_Tree_Fruits", "Banana___Healthy"): "banana_healthy",
    ("Group_4_Orchard_Tree_Fruits", "Durian___Healthy"): "_merged_staging/Durian_Healthy_Merged",
    ("Group_4_Orchard_Tree_Fruits", "Mango_Leaf___Anthracnose"): "mango_Anthracnose",
    ("Group_4_Orchard_Tree_Fruits", "Mango_Leaf___Bacterial_Canker"): "mango_Bacterial Canker",
    ("Group_4_Orchard_Tree_Fruits", "Mango_Leaf___Cutting_Weevil"): "mango_Cutting Weevil",
    ("Group_4_Orchard_Tree_Fruits", "Mango_Leaf___Die_Back"): "mango_Die Back",
    ("Group_4_Orchard_Tree_Fruits", "Mango_Leaf___Gall_Midge"): "mango_Gall Midge",
    ("Group_4_Orchard_Tree_Fruits", "Mango_Leaf___Powdery_Mildew"): "mango_Powdery Mildew",
    ("Group_4_Orchard_Tree_Fruits", "Mango_Leaf___Sooty_Mold"): "mango_Sooty Mould",
    ("Group_4_Orchard_Tree_Fruits", "Mango_Leaf___Healthy"): "mango_Healthy",
    ("Group_4_Orchard_Tree_Fruits", "Papaya___Anthracnose"): "papaya_Anthracnose",
    ("Group_4_Orchard_Tree_Fruits", "Papaya___Bacterial_Spot"): "papaya_BacterialSpot",
    ("Group_4_Orchard_Tree_Fruits", "Papaya___Leaf_Curl_Virus"): "papaya_Curl leaf",
    ("Group_4_Orchard_Tree_Fruits", "Papaya___Ringspot_Virus"): "papaya_RingSpot",
    ("Group_4_Orchard_Tree_Fruits", "Papaya___Healthy"): "papaya_Healthy",
    # GROUP 5
    ("Group_5_Vegetables_Vine_Fruits", "Eggplant___Healthy"): "Eggplant Healthy Leaf",
    ("Group_5_Vegetables_Vine_Fruits", "Pepper_Leaf___Bacterial_Spot"): "Pepper,_bell___Bacterial_spot",
    ("Group_5_Vegetables_Vine_Fruits", "Pepper_Leaf___Healthy"): "Pepper,_bell___healthy",
    ("Group_5_Vegetables_Vine_Fruits", "Tomato_Leaf___Bacterial_Spot"): "Tomato___Bacterial_spot",
    ("Group_5_Vegetables_Vine_Fruits", "Tomato_Leaf___Early_Blight"): "Tomato___Early_blight",
    ("Group_5_Vegetables_Vine_Fruits", "Tomato_Leaf___Late_Blight"): "Tomato___Late_blight",
    ("Group_5_Vegetables_Vine_Fruits", "Tomato_Leaf___Leaf_Mold"): "Tomato___Leaf_Mold",
    ("Group_5_Vegetables_Vine_Fruits", "Tomato_Leaf___Septoria_Leaf_Spot"): "Tomato___Septoria_leaf_spot",
    ("Group_5_Vegetables_Vine_Fruits", "Tomato_Leaf___Spider_Mites"): "Tomato___Spider_mites",
}


def resolve_source_folder(raw_root: Path, folder_pattern: str) -> Path | None:
    # Check STAGING_DIR first if it is a merged folder
    if folder_pattern.startswith("_merged_staging/"):
        sub_name = folder_pattern.split("/", 1)[1]
        staged_path = STAGING_DIR / sub_name
        return staged_path if staged_path.exists() else None

    # Otherwise read from RAW_ROOT
    direct = raw_root / folder_pattern
    if direct.exists():
        return direct
    for item in raw_root.iterdir():
        if item.is_dir() and item.name.startswith(folder_pattern):
            return item
    return None


def is_sharp_enough(img_rgb: Image.Image) -> bool:
    gray = cv2.cvtColor(np.asarray(img_rgb.resize((256, 256))), cv2.COLOR_RGB2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var() >= BLUR_LAPLACIAN_THRESHOLD


def step3_clean_and_split_all():
    print("\n================ STEP 3: CLEANING & SPLITTING 5 GROUPS ================")
    for (group_name, class_name), raw_pattern in tqdm(FOLDER_MAPPING.items(), desc="Processing Classes"):
        src_dir = resolve_source_folder(RAW_ROOT, raw_pattern)
        if src_dir is None:
            print(f"  [SKIPPED - Not Found] {raw_pattern}")
            continue

        files = [p for p in src_dir.rglob("*") if p.is_file() and p.suffix.lower() in VALID_EXTS]
        seen_hashes = []
        valid_images = []

        for f_path in files:
            try:
                with Image.open(f_path) as img:
                    img.verify()
                with Image.open(f_path) as img:
                    img_rgb = img.convert("RGB")
                    w, h = img_rgb.size
                    if w < MIN_DIM or h < MIN_DIM:
                        continue
                    if np.std(np.asarray(img_rgb)) < MIN_STD_DEV:
                        continue
                    if not is_sharp_enough(img_rgb):
                        continue
                    curr_hash = imagehash.dhash(img_rgb)
                    if any((curr_hash - sh) <= DHASH_THRESHOLD for sh in seen_hashes):
                        continue
                    seen_hashes.append(curr_hash)
                    valid_images.append(f_path)
            except Exception:
                continue

        random.seed(42)
        random.shuffle(valid_images)
        n = len(valid_images)
        n_train, n_val = int(n * SPLIT_RATIOS[0]), int(n * SPLIT_RATIOS[1])
        splits = {
            "train": valid_images[:n_train],
            "val": valid_images[n_train:n_train + n_val],
            "test": valid_images[n_train + n_val:],
        }

        for split_name, split_files in splits.items():
            dest_dir = PROJECT_ROOT / group_name / split_name / class_name
            dest_dir.mkdir(parents=True, exist_ok=True)
            for idx, f_path in enumerate(split_files):
                with Image.open(f_path) as img:
                    img_rgb = img.convert("RGB")
                    img_rgb.thumbnail(TARGET_SIZE, Image.Resampling.LANCZOS)
                    img_rgb.save(dest_dir / f"{class_name.lower()}_{idx:05d}.jpg", "JPEG", quality=92)

    # Distribute cleaned Non-Plant background into all 5 Groups
    if CLEAN_NON_PLANT_DIR.exists():
        bg_files = [p for p in CLEAN_NON_PLANT_DIR.iterdir() if p.suffix.lower() in VALID_EXTS]
        random.seed(42)
        sampled_bg = random.sample(bg_files, min(MAX_NON_PLANT_PER_GROUP, len(bg_files)))
        for group_name in sorted({g for (g, _) in FOLDER_MAPPING.keys()}):
            n = len(sampled_bg)
            n_train, n_val = int(n * 0.80), int(n * 0.10)
            splits = {
                "train": sampled_bg[:n_train],
                "val": sampled_bg[n_train:n_train + n_val],
                "test": sampled_bg[n_train + n_val:],
            }
            for split_name, s_files in splits.items():
                dest_dir = PROJECT_ROOT / group_name / split_name / "00_Background_Non_Plant"
                dest_dir.mkdir(parents=True, exist_ok=True)
                for idx, f_path in enumerate(s_files):
                    shutil.copy2(f_path, dest_dir / f"bg_{idx:05d}.jpg")
        print(f"  -> Distributed {len(sampled_bg)} Non-Plant images across all 5 Groups.")


if __name__ == "__main__":
    step1_clean_not_a_plant()
    step2_audit_and_merge()
    step3_clean_and_split_all()
    print("\nALL DONE! Your cleaned 5-group dataset is ready in:", PROJECT_ROOT)