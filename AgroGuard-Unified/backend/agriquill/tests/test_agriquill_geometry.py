import json
from pathlib import Path

import pytest

from agriquill import contract, geometry, onboard

SQUARE = [[16.0, 95.0], [16.0, 95.001], [16.001, 95.001], [16.001, 95.0], [16.0, 95.0]]
BOW_TIE = [[16.0, 95.0], [16.001, 95.001], [16.001, 95.0], [16.0, 95.001], [16.0, 95.0]]
# An L-shape: concave, still one honest field.
L_SHAPE = [
    [16.0, 95.0],
    [16.0, 95.002],
    [16.001, 95.002],
    [16.001, 95.001],
    [16.002, 95.001],
    [16.002, 95.0],
    [16.0, 95.0],
]


def text(ring: list[list[float]], extra: str = "") -> str:
    return f"farm f {{ location: [16, 95] }}\nparcel A {{ boundary: {ring}\n{extra} }}"


def codes(src: str) -> set[str]:
    return {d["code"] for d in contract.verify(src)["diagnostics"]}


def test_bow_tie_and_figure_eight_are_rejected():
    assert geometry.self_intersects(BOW_TIE)
    eight = [
        [16.0, 95.0],
        [16.001, 95.001],
        [16.0, 95.002],
        [15.999, 95.001],
        [16.001, 95.0],
        [16.0, 95.0],
    ]
    assert geometry.ring_problem(eight) is not None
    assert "AGRI-E033" in codes(text(BOW_TIE))


def test_honest_shapes_are_accepted():
    for ring in (SQUARE, L_SHAPE):
        assert geometry.ring_problem(ring) is None
    # a corner given twice, and a closing point that repeats the first, are tolerated
    doubled = [*SQUARE[:2], SQUARE[1], *SQUARE[2:]]
    assert geometry.ring_problem(doubled) is None
    out = contract.verify(text(L_SHAPE))
    assert out["is_valid"]
    assert "AGRI-E033" not in {d["code"] for d in out["diagnostics"]}


def test_a_flat_line_has_no_area():
    line = [[16.0, 95.0], [16.0, 95.001], [16.0, 95.002], [16.0, 95.0]]
    assert geometry.ring_problem(line) is not None
    assert "AGRI-E033" in codes(text(line))


def test_declared_area_off_by_more_than_ten_percent_warns():
    drawn = contract.ring_area_ha(SQUARE)
    assert "AGRI-W033" not in codes(text(SQUARE, f"area: {drawn} ha"))
    assert "AGRI-W033" not in codes(text(SQUARE, f"area: {round(drawn * 1.05, 3)} ha"))
    assert "AGRI-W033" in codes(text(SQUARE, f"area: {round(drawn * 1.3, 3)} ha"))


def test_upload_with_a_crossing_outline_is_refused(tmp_path: Path):
    def feature(name: str, ring: list[list[float]]) -> dict:
        lonlat = [[lon, lat] for lat, lon in ring]
        return {
            "type": "Feature",
            "properties": {"name": name},
            "geometry": {"type": "Polygon", "coordinates": [lonlat]},
        }

    good = tmp_path / "good.geojson"
    good.write_text(json.dumps({"type": "FeatureCollection", "features": [feature("A", L_SHAPE)]}))
    assert onboard.read_boundaries(good)
    bad = tmp_path / "bad.geojson"
    bad.write_text(json.dumps({"type": "FeatureCollection", "features": [feature("Bow", BOW_TIE)]}))
    with pytest.raises(ValueError, match="cross"):
        onboard.read_boundaries(bad)
