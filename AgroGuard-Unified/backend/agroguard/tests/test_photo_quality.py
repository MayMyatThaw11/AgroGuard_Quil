import io

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter

from app.ml.photo_quality import check_photo_quality


def _jpeg(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=88)
    return buffer.getvalue()


def _leaf(size: int = 640) -> Image.Image:
    """A green leaf with veins and brown spots on a mid-grey backdrop: plenty of edge detail."""
    rng = np.random.default_rng(3)
    base = np.full((size, size, 3), (150, 150, 155), dtype=np.uint8)
    image = Image.fromarray(base)
    draw = ImageDraw.Draw(image)
    draw.ellipse((size * 0.1, size * 0.15, size * 0.9, size * 0.85), fill=(52, 140, 48))
    for _ in range(40):
        x, y = rng.integers(size * 0.2, size * 0.8, 2)
        r = int(rng.integers(4, 14))
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(120, 70, 30))
    for k in range(8):
        draw.line(
            (size * 0.5, size * 0.2, size * (0.15 + 0.1 * k), size * 0.8),
            fill=(30, 95, 30),
            width=3,
        )
    return image


def test_a_sharp_well_lit_photo_passes() -> None:
    report = check_photo_quality(_jpeg(_leaf()))
    assert report.ok and report.reasons == []
    assert report.metrics["width"] == 640 and report.metrics["sharpness"] > 25


def test_a_blurred_photo_is_sent_back_for_a_retake() -> None:
    report = check_photo_quality(_jpeg(_leaf().filter(ImageFilter.GaussianBlur(5))))
    assert not report.ok and report.reasons == ["blurry"]


@pytest.mark.parametrize("factor,reason", [(0.18, "too_dark"), (2.4, "too_bright")])
def test_bad_light_is_named_and_not_also_called_blurry(factor: float, reason: str) -> None:
    pixels = np.asarray(_leaf(), dtype=np.float32) * factor
    image = Image.fromarray(pixels.clip(0, 255).astype(np.uint8))
    report = check_photo_quality(_jpeg(image))
    assert report.reasons == [reason]


def test_a_flat_picture_is_uniform() -> None:
    report = check_photo_quality(_jpeg(Image.new("RGB", (640, 640), (128, 128, 128))))
    assert report.reasons == ["uniform"]


def test_a_tiny_picture_is_too_small() -> None:
    report = check_photo_quality(_jpeg(_leaf(160)))
    assert "too_small" in report.reasons and not report.ok


def test_something_that_is_not_an_image_is_unreadable() -> None:
    report = check_photo_quality(b"definitely not a picture")
    assert report.reasons == ["unreadable"] and report.metrics == {}


def test_a_fruit_photo_is_not_rejected_for_not_being_green() -> None:
    # Tomato and mango fruit are supported subjects, so colour must not decide quality.
    rng = np.random.default_rng(5)
    image = Image.fromarray(np.full((640, 640, 3), (60, 90, 50), dtype=np.uint8))
    draw = ImageDraw.Draw(image)
    draw.ellipse((120, 120, 520, 520), fill=(200, 40, 35))
    for _ in range(60):
        x, y = rng.integers(160, 480, 2)
        draw.ellipse((x - 6, y - 6, x + 6, y + 6), fill=(230, 120, 100))
    assert check_photo_quality(_jpeg(image)).ok
