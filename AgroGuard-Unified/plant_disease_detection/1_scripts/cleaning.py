import os
import shutil
import hashlib
from pathlib import Path
from typing import Dict, Tuple, Optional, List, Union

import cv2
import numpy as np
from PIL import Image, ImageOps
import imagehash
from tqdm import tqdm


class DatasetCleaner:
    def __init__(
        self,
        raw_dir: Union[str, Path],
        staging_dir: Union[str, Path],
        rejected_dir: Union[str, Path],
        min_width: int = 128,
        min_height: int = 128,
        blur_threshold: float = 80.0,
        min_brightness: float = 20.0,
        max_brightness: float = 240.0,
        min_contrast_std: float = 12.0,
        phash_distance_threshold: int = 4,
        move_raw_files: bool = False,
    ):
        self.raw_dir = Path(raw_dir)
        self.staging_dir = Path(staging_dir)
        self.rejected_dir = Path(rejected_dir)

        self.min_width = min_width
        self.min_height = min_height
        self.blur_threshold = blur_threshold
        self.min_brightness = min_brightness
        self.max_brightness = max_brightness
        self.min_contrast_std = min_contrast_std

        self.phash_distance_threshold = phash_distance_threshold
        self.move_raw_files = move_raw_files

        self.valid_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff"}

        self.md5_registry: Dict[str, Path] = {}
        self.phash_registry: Dict[imagehash.ImageHash, Path] = {}

        self.stats = {
            "total_scanned": 0,
            "accepted_to_staging": 0,
            "rejected_corrupted": 0,
            "rejected_duplicate": 0,
            "rejected_low_quality": 0,
        }

    @staticmethod
    def compute_md5(file_path: Path) -> str:
        hasher = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    def check_image_health_and_quality(
        self, file_path: Path
    ) -> Tuple[bool, str, Optional[str], Optional[imagehash.ImageHash]]:
        # 1. Check Missing / Zero-byte
        if not file_path.exists() or file_path.stat().st_size == 0:
            return False, "corrupted_empty_file", None, None

        # 2. Check PIL Integrity & Compute Perceptual Hash
        try:
            with Image.open(file_path) as img:
                img.verify()

            with Image.open(file_path) as img:
                img = ImageOps.exif_transpose(img)
                img_rgb = img.convert("RGB")
                width, height = img_rgb.size

                if width < self.min_width or height < self.min_height:
                    return False, f"low_quality_small_res_{width}x{height}", None, None

                phash = imagehash.phash(img_rgb)
        except Exception:
            return False, "corrupted_pil_decode", None, None

        # 3. Check OpenCV Decode & Visual Recognizability (Blur, Exposure, Contrast)
        try:
            file_bytes = np.fromfile(str(file_path), dtype=np.uint8)
            cv_img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
            if cv_img is None:
                return False, "corrupted_cv2_decode", None, None

            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)

            blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
            if blur_score < self.blur_threshold:
                return False, f"low_quality_blurry_{blur_score:.1f}", None, None

            mean_brightness = float(np.mean(gray))
            if mean_brightness < self.min_brightness:
                return False, f"low_quality_too_dark_{mean_brightness:.1f}", None, None
            if mean_brightness > self.max_brightness:
                return False, f"low_quality_too_bright_{mean_brightness:.1f}", None, None

            contrast_std = float(np.std(gray))
            if contrast_std < self.min_contrast_std:
                return False, f"low_quality_low_contrast_{contrast_std:.1f}", None, None

        except Exception:
            return False, "corrupted_cv2_processing", None, None

        # 4. Check Exact & Near-Duplicates
        md5_hash = self.compute_md5(file_path)
        if md5_hash in self.md5_registry:
            return False, "duplicate_exact_md5", md5_hash, phash

        for existing_phash in self.phash_registry:
            if (phash - existing_phash) <= self.phash_distance_threshold:
                return False, "duplicate_visual_phash", md5_hash, phash

        return True, "valid", md5_hash, phash

    def _get_image_files(self, directory: Path) -> List[Path]:
        if not directory.exists():
            print(f"WARNING: Directory does not exist: {directory}")
            return []

        excluded_dirs = {self.staging_dir.resolve(), self.rejected_dir.resolve()}
        image_files = []

        for p in directory.rglob("*"):
            if p.is_file() and p.suffix.lower() in self.valid_extensions:
                if excluded_dirs.intersection(set(p.resolve().parents)):
                    continue
                image_files.append(p)
        return image_files

    def _quarantine_file(self, file_path: Path, base_dir: Path, reason: str, move: bool = False):
        category = reason.split("_")[0]
        if category == "low":
            category = "low_quality"

        rel_path = file_path.relative_to(base_dir)
        dest_path = self.rejected_dir / category / reason / rel_path
        dest_path.parent.mkdir(parents=True, exist_ok=True)

        if dest_path.exists():
            dest_path = dest_path.with_name(f"{dest_path.stem}_{os.urandom(2).hex()}{dest_path.suffix}")

        if move:
            shutil.move(str(file_path), str(dest_path))
        else:
            shutil.copy2(str(file_path), str(dest_path))

        if category == "corrupted":
            self.stats["rejected_corrupted"] += 1
        elif category == "duplicate":
            self.stats["rejected_duplicate"] += 1
        else:
            self.stats["rejected_low_quality"] += 1

    def run_pipeline(self):
        raw_files = self._get_image_files(self.raw_dir)
        self.stats["total_scanned"] = len(raw_files)
        print(f"Found {len(raw_files)} images in RAW_ROOT to clean...")

        for file_path in tqdm(raw_files, desc="Cleaning Raw Images"):
            is_valid, reason, md5_hash, phash = self.check_image_health_and_quality(file_path)

            if is_valid:
                self.md5_registry[md5_hash] = file_path
                self.phash_registry[phash] = file_path

                rel_path = file_path.relative_to(self.raw_dir)
                dest_path = self.staging_dir / rel_path
                dest_path.parent.mkdir(parents=True, exist_ok=True)

                if dest_path.exists():
                    dest_path = dest_path.with_name(f"{dest_path.stem}_{md5_hash[:6]}{dest_path.suffix}")

                if self.move_raw_files:
                    shutil.move(str(file_path), str(dest_path))
                else:
                    shutil.copy2(str(file_path), str(dest_path))

                self.stats["accepted_to_staging"] += 1
            else:
                self._quarantine_file(file_path, self.raw_dir, reason, move=self.move_raw_files)

        print("\n=== Dataset Cleaning Complete ===")
        for key, value in self.stats.items():
            print(f"  {key.replace('_', ' ').title()}: {value}")
        print(f"\nCleaned images saved to:  {self.staging_dir}")
        print(f"Rejected images saved to: {self.rejected_dir}")


if __name__ == "__main__":
    # =====================================================================
    # 1. YOUR DATASET DIRECTORIES
    # =====================================================================
    # The folder with ~400 images that you want to clean:
    RAW_ROOT = Path(r"C:\Users\Thant Zin Moe\Desktop\Gintama\Ai-Youth_Festa_2026\dataset\Crops\Chilli")

    # Your main project dataset folder:
    PROJECT_ROOT = Path(r"C:\Users\Thant Zin Moe\Desktop\Gintama\Ai-Youth_Festa_2026\YOLO_plant_disease_detection\plants_datasets")

    # Saves the cleaned 400 images inside plants_datasets\cleaned_new_train
    STAGING_ROOT = PROJECT_ROOT / "cleaned_new_train"
    REJECTED_ROOT = PROJECT_ROOT.parent / "rejected_images"
    # =====================================================================

    cleaner = DatasetCleaner(
        raw_dir=RAW_ROOT,
        staging_dir=STAGING_ROOT,
        rejected_dir=REJECTED_ROOT,
        min_width=128,
        min_height=128,
        blur_threshold=80.0,
        phash_distance_threshold=4,
        move_raw_files=False,
    )

    cleaner.run_pipeline()