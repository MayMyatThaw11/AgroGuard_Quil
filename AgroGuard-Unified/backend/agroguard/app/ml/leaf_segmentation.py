"""K-means segmentation of a plant photo into background, healthy and diseased.

Pixels are clustered on colour (hue weighted by saturation, plus brightness).
Each cluster is then labelled:

- background: the cluster that dominates the image border (unless it is
  green, which means the leaf fills the frame);
- healthy: green leaf tissue;
- diseased: everything else on the leaf (yellowing, browning, dark lesions).

The affected area is diseased pixels as a share of all leaf pixels. This is a
colour heuristic, not a diagnosis: it measures how much of the leaf looks
discoloured, and is stored next to the disease service's own prediction.
"""

import io
from dataclasses import dataclass, field

import numpy as np
from PIL import Image
from sklearn.cluster import KMeans

MAX_SIDE = 384
DEFAULT_K = 8
SAMPLE_PIXELS = 20_000
BORDER_FRACTION = 0.04
# Hue window (degrees) and minimum saturation that count as healthy green.
GREEN_HUE = (65.0, 170.0)
GREEN_MIN_SATURATION = 0.18
# Lesions are yellow, brown, red or black. Bluish/purplish low-saturation
# clusters are shadows or a grey backdrop, never leaf tissue.
SHADOW_HUE = (170.0, 330.0)
SHADOW_MAX_SATURATION = 0.35

BACKGROUND, HEALTHY, DISEASED = "background", "healthy", "diseased"
OVERLAY = {HEALTHY: (46, 160, 67), DISEASED: (220, 38, 38)}


@dataclass
class ClusterSummary:
    label: str
    share_percent: float
    hue_deg: float
    saturation: float
    value: float


@dataclass
class SegmentationResult:
    affected_percent: float
    leaf_coverage_percent: float
    k: int
    mask_png: bytes
    clusters: list[ClusterSummary] = field(default_factory=list)


def _features(hsv: np.ndarray) -> np.ndarray:
    hue = hsv[..., 0] * 2 * np.pi
    sat, val = hsv[..., 1], hsv[..., 2]
    # Hue is circular, so encode it as a saturation-weighted unit vector.
    return np.stack([sat * np.cos(hue), sat * np.sin(hue), val], axis=-1).reshape(-1, 3)


def _circular_hue_deg(hue: np.ndarray, weight: np.ndarray) -> float:
    angle = hue * 2 * np.pi
    mean = np.arctan2((np.sin(angle) * weight).sum(), (np.cos(angle) * weight).sum())
    return float(np.degrees(mean) % 360)


def segment_leaf(image_bytes: bytes, k: int = DEFAULT_K) -> SegmentationResult:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    rgb = np.asarray(image, dtype=np.float32) / 255.0
    hsv = np.asarray(image.convert("HSV"), dtype=np.float32) / 255.0
    height, width = hsv.shape[:2]

    features = _features(hsv)
    rng = np.random.default_rng(0)
    sample = features[rng.choice(len(features), min(SAMPLE_PIXELS, len(features)), replace=False)]
    # Flat-colour images can have fewer distinct colours than k clusters.
    k = max(1, min(k, len(np.unique(sample.round(3), axis=0))))
    model = KMeans(n_clusters=k, n_init=4, random_state=0).fit(sample)
    labels = model.predict(features).reshape(height, width)

    border = np.zeros((height, width), dtype=bool)
    band_h, band_w = max(1, int(height * BORDER_FRACTION)), max(1, int(width * BORDER_FRACTION))
    border[:band_h] = border[-band_h:] = True
    border[:, :band_w] = border[:, -band_w:] = True
    border_counts = np.bincount(labels[border], minlength=k)

    flat_hsv = hsv.reshape(-1, 3)
    flat_labels = labels.reshape(-1)
    summaries: dict[int, ClusterSummary] = {}
    for cluster in range(k):
        members = flat_hsv[flat_labels == cluster]
        if len(members) == 0:
            continue
        hue_deg = _circular_hue_deg(members[:, 0], members[:, 1] + 1e-6)
        saturation, value = float(members[:, 1].mean()), float(members[:, 2].mean())
        green = GREEN_HUE[0] <= hue_deg <= GREEN_HUE[1] and saturation >= GREEN_MIN_SATURATION
        summaries[cluster] = ClusterSummary(
            label=HEALTHY if green else DISEASED,
            share_percent=round(100 * len(members) / len(flat_labels), 1),
            hue_deg=round(hue_deg, 1),
            saturation=round(saturation, 3),
            value=round(value, 3),
        )

    background = int(border_counts.argmax())
    if background in summaries and summaries[background].label != HEALTHY:
        summaries[background].label = BACKGROUND
    for summary in summaries.values():
        if (
            summary.label == DISEASED
            and SHADOW_HUE[0] <= summary.hue_deg <= SHADOW_HUE[1]
            and summary.saturation <= SHADOW_MAX_SATURATION
        ):
            summary.label = BACKGROUND

    label_map = np.full((height, width), BACKGROUND, dtype=object)
    for cluster, summary in summaries.items():
        label_map[labels == cluster] = summary.label

    healthy_px = int((label_map == HEALTHY).sum())
    diseased_px = int((label_map == DISEASED).sum())
    leaf_px = healthy_px + diseased_px
    affected = 100 * diseased_px / leaf_px if leaf_px else 0.0

    return SegmentationResult(
        affected_percent=round(affected, 1),
        leaf_coverage_percent=round(100 * leaf_px / (height * width), 1),
        k=k,
        mask_png=_render_mask(rgb, label_map),
        clusters=sorted(summaries.values(), key=lambda s: s.share_percent, reverse=True),
    )


def _render_mask(rgb: np.ndarray, label_map: np.ndarray) -> bytes:
    """The photo with healthy tissue tinted green, diseased red, background dimmed."""
    out = rgb.copy()
    grey = rgb.mean(axis=-1, keepdims=True)
    background = label_map == BACKGROUND
    out[background] = (grey * 0.35)[background]
    for label, colour in OVERLAY.items():
        where = label_map == label
        out[where] = out[where] * 0.45 + np.array(colour, dtype=np.float32) / 255.0 * 0.55
    buffer = io.BytesIO()
    pixels = (out * 255).clip(0, 255).astype(np.uint8)
    Image.fromarray(pixels).save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
