from __future__ import annotations

import math

# A drawn area and a declared area may differ by this much before the planner says so.
AREA_TOLERANCE = 0.10


def _local(ring: list[list[float]]) -> list[tuple[float, float]]:
    """Metres east and north of the first corner; flat-earth is exact enough for one field."""
    lat0 = sum(p[0] for p in ring) / len(ring)
    kx = 111320.0 * math.cos(math.radians(lat0))
    return [((p[1] - ring[0][1]) * kx, (p[0] - ring[0][0]) * 110574.0) for p in ring]


def _corners(ring: list[list[float]]) -> list[tuple[float, float]]:
    """Distinct corners in order: no closing repeat, no back-to-back duplicates."""
    pts = _local(ring)
    out: list[tuple[float, float]] = []
    for p in pts:
        if not out or p != out[-1]:
            out.append(p)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


def _cross(o: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _within(a: tuple[float, float], b: tuple[float, float], p: tuple[float, float]) -> bool:
    return min(a[0], b[0]) <= p[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= p[1] <= max(a[1], b[1])


def _touch_or_cross(
    a: tuple[float, float], b: tuple[float, float], c: tuple[float, float], d: tuple[float, float]
) -> bool:
    d1, d2, d3, d4 = _cross(c, d, a), _cross(c, d, b), _cross(a, b, c), _cross(a, b, d)
    if ((d1 > 0 > d2) or (d1 < 0 < d2)) and ((d3 > 0 > d4) or (d3 < 0 < d4)):
        return True
    return (
        (d1 == 0 and _within(c, d, a))
        or (d2 == 0 and _within(c, d, b))
        or (d3 == 0 and _within(a, b, c))
        or (d4 == 0 and _within(a, b, d))
    )


def self_intersects(ring: list[list[float]]) -> bool:
    """True when two edges that are not neighbours meet: a bow-tie or figure-eight.

    Concave shapes, a repeated corner and the closing repeat of the first point are fine.
    """
    pts = _corners(ring)
    n = len(pts)
    if n < 4:
        return False
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        for j in range(i + 1, n):
            if j == i + 1 or (i == 0 and j == n - 1):
                continue
            if _touch_or_cross(a, b, pts[j], pts[(j + 1) % n]):
                return True
    return False


def distinct_corners(ring: list[list[float]]) -> int:
    return len(_corners(ring))


def area_mismatch(declared_ha: float | None, drawn_ha: float) -> bool:
    if not declared_ha:
        return False
    return abs(drawn_ha - declared_ha) > AREA_TOLERANCE * declared_ha


def ring_problem(ring: list[list[float]]) -> str | None:
    """Why this closed ring cannot be one field, or None when it can."""
    if distinct_corners(ring) < 3:
        return "it has fewer than three different corners"
    if self_intersects(ring):
        return "its edges cross each other (a bow-tie or figure-eight shape)"
    pts = _corners(ring)
    twice = sum(
        pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
        for i in range(len(pts))
    )
    if abs(twice) / 2 < 1.0:
        return "its corners enclose less than one square metre"
    return None
