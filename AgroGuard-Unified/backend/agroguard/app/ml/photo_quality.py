"""Is this photo good enough to diagnose from?

Runs before a plant photo reaches the disease model, so a blurry, dark, tiny or blank
picture is sent back for a retake instead of getting a confident wrong answer.

The checks work on any plant organ (leaf, stem or fruit), so they never look for green.
Whether the picture shows a plant at all is the disease model's own "not a plant" class.

Every threshold below is a starting value that has NOT been validated on Myanmar farmer
photos taken on cooperative phones (TO VERIFY). Treat a failed check as "please retake",
never as proof the photo is bad, and re-tune with reviewed photos (see the review queue).
"""

import io
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageOps

MAX_SIDE = 512
MIN_SIDE_PX = 224  # the classifiers resize to 224, so less than this has no detail to offer
TILES = 6  # the frame is judged in a 6 x 6 grid
SHARP_PERCENTILE = 90  # ...by its sharper tiles
BLUR_MIN = 25.0  # Laplacian variance of the sharper tiles, on the 512 px grey image
DARK_MEAN_MAX = 45.0  # mean grey level (0-255)
BRIGHT_MEAN_MIN = 215.0
CLIPPED_MAX_SHARE = 0.35  # share of pixels at pure white or pure black
UNIFORM_STD_MAX = 8.0  # grey-level spread: a flat wall, sky or lens cap

REASONS = ("unreadable", "too_small", "blurry", "too_dark", "too_bright", "uniform")


@dataclass
class QualityReport:
    ok: bool
    reasons: list[str] = field(default_factory=list)
    metrics: dict[str, float] = field(default_factory=dict)


def _sharpness(gray: np.ndarray) -> float:
    """How sharp the sharpest parts of the picture are.

    The variance of the Laplacian over the whole frame punishes a sharp photo of a smooth
    subject (a plain healthy leaf on a plain background), because most of the frame has no
    detail to measure. So the frame is cut into tiles and the sharp tiles decide: a photo
    is only blurry when every part of it is soft.
    """
    centre = gray[1:-1, 1:-1]
    laplacian = gray[:-2, 1:-1] + gray[2:, 1:-1] + gray[1:-1, :-2] + gray[1:-1, 2:] - 4 * centre
    rows = np.array_split(laplacian, TILES, axis=0)
    tiles = [float(block.var()) for row in rows for block in np.array_split(row, TILES, axis=1)]
    return float(np.percentile(tiles, SHARP_PERCENTILE))


def check_photo_quality(image_bytes: bytes) -> QualityReport:
    try:
        image = Image.open(io.BytesIO(image_bytes))
        image = ImageOps.exif_transpose(image).convert("RGB")
    except Exception:
        return QualityReport(ok=False, reasons=["unreadable"])

    width, height = image.size
    reasons: list[str] = []
    if min(width, height) < MIN_SIDE_PX:
        reasons.append("too_small")

    small = image.copy()
    small.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.BILINEAR)
    gray = np.asarray(small.convert("L"), dtype=np.float32)
    if gray.shape[0] < 3 or gray.shape[1] < 3:
        return QualityReport(ok=False, reasons=["unreadable"])

    sharpness = _sharpness(gray)
    mean = float(gray.mean())
    spread = float(gray.std())
    clipped = float(((gray >= 250) | (gray <= 5)).mean())

    # Exposure first: in a too-dark or washed-out picture the sharpness and contrast
    # readings mean nothing, so they are only judged when the light is usable.
    if mean < DARK_MEAN_MAX or (clipped > CLIPPED_MAX_SHARE and mean < 128):
        reasons.append("too_dark")
    elif mean > BRIGHT_MEAN_MIN or (clipped > CLIPPED_MAX_SHARE and mean >= 128):
        reasons.append("too_bright")
    elif spread < UNIFORM_STD_MAX:
        reasons.append("uniform")
    elif sharpness < BLUR_MIN:
        reasons.append("blurry")

    return QualityReport(
        ok=not reasons,
        reasons=reasons,
        metrics={
            "width": width,
            "height": height,
            "sharpness": round(sharpness, 1),
            "brightness": round(mean, 1),
            "contrast": round(spread, 1),
            "clipped_share": round(clipped, 3),
        },
    )
