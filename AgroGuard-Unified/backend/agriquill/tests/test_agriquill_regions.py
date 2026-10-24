import json

import pytest

from agriquill import onboard, regions

CAPITALS = [
    (19.75, 96.1),
    (13.75, 100.5),
    (21.03, 105.85),
    (11.55, 104.92),
    (17.97, 102.6),
    (-6.2, 106.85),
    (3.14, 101.69),
    (1.35, 103.82),
    (14.6, 120.98),
    (4.89, 114.94),
    (-8.56, 125.57),
]
ELSEWHERE = [
    (28.61, 77.21),
    (39.9, 116.4),
    (25.03, 121.56),
    (23.81, 90.41),
    (-31.95, 115.86),
    (-12.46, 130.84),
    (48.86, 2.35),
]


def test_every_asean_member_has_a_box_and_each_capital_is_inside():
    assert len(regions.ASEAN_BOXES) == 11
    assert all(regions.in_asean(lat, lon) for lat, lon in CAPITALS)


def test_places_outside_asean_are_not_covered():
    assert not any(regions.in_asean(lat, lon) for lat, lon in ELSEWHERE)


def _geojson(tmp_path, lon, lat):
    d = 0.001
    ring = [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]
    path = tmp_path / "b.geojson"
    path.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"name": "A"},
                        "geometry": {"type": "Polygon", "coordinates": [ring]},
                    }
                ],
            }
        )
    )
    return path


def test_a_boundary_inside_asean_is_read(tmp_path):
    assert list(onboard.read_boundaries(_geojson(tmp_path, 95.18, 17.1)))


def test_a_boundary_outside_asean_is_refused_in_plain_words(tmp_path):
    with pytest.raises(ValueError, match="ASEAN"):
        onboard.read_boundaries(_geojson(tmp_path, 77.21, 28.61))
