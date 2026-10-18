import io

import numpy as np
from PIL import Image, ImageDraw

from app.ml.leaf_segmentation import segment_leaf


def _png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _leaf_with_spots(spot_radius: int) -> tuple[bytes, float]:
    """Grey background, green elliptical leaf, brown spots; returns (png, true affected %)."""
    image = Image.new("RGB", (300, 300), (150, 150, 155))
    draw = ImageDraw.Draw(image)
    draw.ellipse((40, 60, 260, 240), fill=(52, 140, 48))
    for cx, cy in [(100, 120), (180, 110), (150, 180), (210, 170)]:
        draw.ellipse(
            (cx - spot_radius, cy - spot_radius, cx + spot_radius, cy + spot_radius),
            fill=(120, 70, 30),
        )
    pixels = np.asarray(image)
    leaf = (pixels != (150, 150, 155)).any(axis=-1)
    spots = (pixels == (120, 70, 30)).all(axis=-1)
    return _png(image), 100 * spots.sum() / leaf.sum()


def test_measures_diseased_share_of_leaf() -> None:
    png, truth = _leaf_with_spots(spot_radius=22)
    result = segment_leaf(png)
    assert abs(result.affected_percent - truth) < 3
    assert 30 < result.leaf_coverage_percent < 50
    assert {c.label for c in result.clusters} >= {"background", "healthy", "diseased"}


def test_healthy_leaf_has_little_affected_area() -> None:
    png, _ = _leaf_with_spots(spot_radius=0)
    assert segment_leaf(png).affected_percent < 3


def test_leaf_filling_frame_is_not_mistaken_for_background() -> None:
    image = Image.new("RGB", (200, 200), (52, 140, 48))
    ImageDraw.Draw(image).ellipse((80, 80, 120, 120), fill=(120, 70, 30))
    result = segment_leaf(_png(image))
    assert result.leaf_coverage_percent > 95
    assert 2 < result.affected_percent < 6


def test_mask_is_a_png_of_the_resized_photo() -> None:
    png, _ = _leaf_with_spots(spot_radius=15)
    mask = Image.open(io.BytesIO(segment_leaf(png).mask_png))
    assert mask.format == "PNG"
    assert mask.size == (300, 300)
