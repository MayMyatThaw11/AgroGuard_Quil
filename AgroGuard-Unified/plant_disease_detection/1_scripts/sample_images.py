#!/usr/bin/env python3
"""
Randomly sample N images per class from a folder-per-class dataset.

Input layout:
    source_dir/
        tomato__early_blight/   img1.jpg ...
        tomato__healthy/        ...
        apple__scab/            ...

Output layout (no split):
    output_dir/<class>/<images>

Output layout (with --split):
    output_dir/train/<class>/...
    output_dir/val/<class>/...
    output_dir/test/<class>/...

Examples:
    python sample_images.py --src raw_data --dst dataset50 --n 50
    python sample_images.py --src raw_data --dst dataset50 --n 50 --split 0.7 0.15 0.15
    python sample_images.py --src raw_data --dst dataset50 --n 50 --dedupe --min-size 100
"""

import argparse
import csv
import hashlib
import random
import shutil
import sys
from pathlib import Path

IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}


def list_images(class_dir: Path):
    """All image files in a class folder, including nested subfolders."""
    return sorted(p for p in class_dir.rglob("*") if p.is_file() and p.suffix.lower() in IMG_EXTS)


def file_hash(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def is_valid_image(path: Path, min_size: int) -> bool:
    """Skip corrupted or tiny images. Needs Pillow; if missing, accept everything."""
    try:
        from PIL import Image
    except ImportError:
        return True
    try:
        with Image.open(path) as im:
            im.verify()
        with Image.open(path) as im:
            w, h = im.size
        return min(w, h) >= min_size
    except Exception:
        return False


def split_list(items, ratios):
    """Split a list into train/val/test by ratios (must sum to ~1)."""
    n = len(items)
    n_train = round(n * ratios[0])
    n_val = round(n * ratios[1])
    # make sure val/test are not empty when there are enough images
    if n >= 3:
        n_val = max(n_val, 1)
        n_train = min(n_train, n - n_val - 1)
    train = items[:n_train]
    val = items[n_train:n_train + n_val]
    test = items[n_train + n_val:]
    return {"train": train, "val": val, "test": test}


def main():
    ap = argparse.ArgumentParser(description="Randomly sample N images per class.")
    ap.add_argument("--src", required=True, help="Source folder with one subfolder per class")
    ap.add_argument("--dst", required=True, help="Output folder")
    ap.add_argument("--n", type=int, default=50, help="Images per class (default 50)")
    ap.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    ap.add_argument("--split", type=float, nargs=3, metavar=("TRAIN", "VAL", "TEST"),
                    help="Optional split ratios, e.g. 0.7 0.15 0.15")
    ap.add_argument("--dedupe", action="store_true", help="Remove exact duplicate files within a class")
    ap.add_argument("--min-size", type=int, default=0,
                    help="Skip images whose shorter side is below this many pixels (needs Pillow)")
    ap.add_argument("--move", action="store_true", help="Move files instead of copying")
    ap.add_argument("--min-images", type=int, default=20,
                    help="Warn about classes with fewer than this many usable images")
    args = ap.parse_args()

    src, dst = Path(args.src), Path(args.dst)
    if not src.is_dir():
        sys.exit(f"Source folder not found: {src}")
    if args.split and abs(sum(args.split) - 1.0) > 1e-6:
        sys.exit("--split ratios must sum to 1.0")
    if dst.exists() and any(dst.iterdir()):
        sys.exit(f"Output folder {dst} is not empty. Choose a new folder to avoid mixing runs.")

    rng = random.Random(args.seed)
    transfer = shutil.move if args.move else shutil.copy2
    class_dirs = sorted(d for d in src.iterdir() if d.is_dir())
    if not class_dirs:
        sys.exit("No class subfolders found in the source folder.")

    rows, warnings = [], []
    for cdir in class_dirs:
        imgs = list_images(cdir)
        found = len(imgs)

        if args.dedupe:
            seen, unique = set(), []
            for p in imgs:
                hsh = file_hash(p)
                if hsh not in seen:
                    seen.add(hsh)
                    unique.append(p)
            imgs = unique

        # always drop corrupted files (and tiny ones if --min-size is set)
        imgs = [p for p in imgs if is_valid_image(p, args.min_size)]

        rng.shuffle(imgs)
        chosen = imgs[: args.n]

        if len(chosen) < args.min_images:
            warnings.append(f"{cdir.name}: only {len(chosen)} usable images (found {found})")
        elif len(chosen) < args.n:
            warnings.append(f"{cdir.name}: {len(chosen)} < {args.n}, took all available")

        groups = split_list(chosen, args.split) if args.split else {"": chosen}
        for split_name, files in groups.items():
            out_dir = dst / split_name / cdir.name if split_name else dst / cdir.name
            out_dir.mkdir(parents=True, exist_ok=True)
            for i, p in enumerate(files):
                # prefix with index to avoid name collisions from nested folders
                new_name = f"{cdir.name}_{split_name + '_' if split_name else ''}{i:04d}{p.suffix.lower()}"
                transfer(str(p), str(out_dir / new_name))

        counts = {k: len(v) for k, v in groups.items()}
        rows.append({
            "class": cdir.name,
            "found": found,
            "selected": len(chosen),
            "train": counts.get("train", ""),
            "val": counts.get("val", ""),
            "test": counts.get("test", ""),
        })
        print(f"{cdir.name:45s} found={found:5d} selected={len(chosen):3d}")

    dst.mkdir(parents=True, exist_ok=True)
    with open(dst / "summary.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["class", "found", "selected", "train", "val", "test"])
        w.writeheader()
        w.writerows(rows)

    total = sum(r["selected"] for r in rows)
    print(f"\nDone. {len(rows)} classes, {total} images -> {dst}")
    print(f"Summary saved to {dst / 'summary.csv'}")
    if warnings:
        print("\nWarnings:")
        for msg in warnings:
            print("  -", msg)


if __name__ == "__main__":
    main()
