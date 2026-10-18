import random
import shutil
from pathlib import Path

# =====================================================================
# UPDATE THIS PATH TO YOUR project_datasets FOLDER:
PROJECT_ROOT = Path(r"C:\Users\Thant Zin Moe\Desktop\Gintama\Ai-Youth_Festa_2026\YOLO_plant_disease_detection\plants_datasets")
# =====================================================================

VALID_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff"}
VAL_RATIO = 0.10   # 10% moved to val
TEST_RATIO = 0.10  # 10% moved to test (leaves 80% in train)


def get_images(folder: Path) -> list[Path]:
    if not folder.exists():
        return []
    return sorted([p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in VALID_EXTS])


def split_new_train_classes():
    group_dirs = sorted([d for d in PROJECT_ROOT.iterdir() if d.is_dir() and d.name.startswith("Group_")])
    if not group_dirs:
        print(f"[ERROR] No 'Group_*' folders found in {PROJECT_ROOT}")
        return

    skipped_existing = 0
    newly_split = 0

    for g_dir in group_dirs:
        train_root = g_dir / "train"
        val_root = g_dir / "val"
        test_root = g_dir / "test"

        if not train_root.exists():
            continue

        for train_class_dir in sorted([d for d in train_root.iterdir() if d.is_dir()]):
            class_name = train_class_dir.name
            val_class_dir = val_root / class_name
            test_class_dir = test_root / class_name

            train_imgs = get_images(train_class_dir)
            val_imgs = get_images(val_class_dir)
            test_imgs = get_images(test_class_dir)

            # 1. If val and test already have images, skip this class
            if len(val_imgs) > 0 and len(test_imgs) > 0:
                skipped_existing += 1
                continue

            if len(train_imgs) == 0:
                print(f"  [EMPTY FOLDER] {g_dir.name}/train/{class_name} has 0 images.")
                continue

            # 2. Shuffle and calculate 80 / 10 / 10 split counts
            random.seed(42)
            random.shuffle(train_imgs)
            total = len(train_imgs)
            n_val = max(1, int(total * VAL_RATIO))
            n_test = max(1, int(total * TEST_RATIO))

            val_to_move = train_imgs[:n_val]
            test_to_move = train_imgs[n_val:n_val + n_test]
            n_train_left = total - len(val_to_move) - len(test_to_move)

            # 3. Create val & test folders and move the 10% + 10% subsets
            val_class_dir.mkdir(parents=True, exist_ok=True)
            test_class_dir.mkdir(parents=True, exist_ok=True)

            for img_path in val_to_move:
                shutil.move(str(img_path), str(val_class_dir / img_path.name))

            for img_path in test_to_move:
                shutil.move(str(img_path), str(test_class_dir / img_path.name))

            newly_split += 1
            print(f"  [SPLIT DONE] {g_dir.name} -> {class_name}: "
                  f"Train={n_train_left}, Val={len(val_to_move)}, Test={len(test_to_move)}")

    print("\n================ SUMMARY ================")
    print(f"Existing classes untouched : {skipped_existing}")
    print(f"New classes split (80/10/10): {newly_split}")
    print(f"Total classes ready        : {skipped_existing + newly_split}")


if __name__ == "__main__":
    split_new_train_classes()