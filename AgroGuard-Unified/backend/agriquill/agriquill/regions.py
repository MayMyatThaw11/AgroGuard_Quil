from __future__ import annotations

ASEAN_BOXES: dict[str, tuple[float, float, float, float]] = {
    "MM": (92.1, 9.5, 101.2, 28.6),
    "TH": (97.3, 5.6, 105.7, 20.5),
    "VN": (102.1, 8.4, 109.6, 23.4),
    "KH": (102.3, 10.4, 107.7, 14.7),
    "LA": (100.0, 13.9, 107.7, 22.5),
    "ID": (95.0, -11.1, 141.1, 6.1),
    "MY": (99.6, 0.8, 119.3, 7.4),
    "SG": (103.6, 1.1, 104.1, 1.5),
    "PH": (116.9, 4.6, 126.7, 21.2),
    "BN": (114.0, 4.0, 115.4, 5.1),
    "TL": (124.0, -9.6, 127.4, -8.1),
}
BOXES_STATUS = (
    "TO VERIFY: approximate national extents, a coarse screen and not a border; "
    "check against Natural Earth admin-0 before relying on an edge case"
)
OUTSIDE = "the farm map covers the ASEAN countries only for now"


def in_asean(lat: float, lon: float) -> bool:
    return any(s <= lat <= n and w <= lon <= e for w, s, e, n in ASEAN_BOXES.values())
