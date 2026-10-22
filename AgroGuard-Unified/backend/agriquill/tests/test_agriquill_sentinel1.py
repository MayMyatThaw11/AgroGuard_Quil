import numpy as np
import pytest

from agriquill.data import sentinel1


def test_backscatter_is_averaged_in_linear_power_then_converted_to_db():
    win = np.array([[0.01, 0.1], [np.nan, -32768.0]], dtype=np.float32)
    mask = np.array([[True, True], [True, True]])
    out = sentinel1.scene_db(win, mask)
    assert out["valid_pixels"] == 2 and out["pixels"] == 4
    assert out["vv_db"] == pytest.approx(10 * np.log10(0.055), abs=0.01)


def test_no_valid_pixel_gives_null_with_a_reason():
    out = sentinel1.scene_db(np.full((2, 2), np.nan, np.float32), np.ones((2, 2), bool))
    assert out["vv_db"] is None and out["reason"]


def test_open_water_call_says_what_it_cannot_see():
    assert sentinel1.water_call(-21.0)["call"] == "open water"
    dry = sentinel1.water_call(-9.5)
    assert dry["call"] == "no open water"
    assert "canopy" in dry["caveat"]
    assert sentinel1.water_call(None)["call"] is None


def test_revisit_is_counted_within_one_orbit_geometry_only():
    scenes = [
        {"datetime": "2026-10-19T11:45:54Z", "relative_orbit": 143},
        {"datetime": "2026-10-16T23:32:59Z", "relative_orbit": 106},
        {"datetime": "2026-10-07T11:45:55Z", "relative_orbit": 143},
        {"datetime": "2026-10-04T23:32:59Z", "relative_orbit": 106},
        {"datetime": "2026-09-25T11:45:55Z", "relative_orbit": 143},
    ]
    out = sentinel1.revisit(scenes)
    assert out["same_orbit_days"] == 12
    assert out["shortest_resolvable_cycle_days"] == 24


def test_agreement_is_reported_against_chance_and_withheld_on_few_pairs():
    pairs = [(True, True)] * 6 + [(False, False)] * 4 + [(True, False)] * 2
    out = sentinel1.agreement(pairs)
    assert out["pairs"] == 12 and out["agree"] == 10
    radar_wet, depth_wet = 8 / 12, 6 / 12
    chance = radar_wet * depth_wet + (1 - radar_wet) * (1 - depth_wet)
    assert out["chance"] == pytest.approx(chance, abs=1e-3)
    few = sentinel1.agreement(pairs[:5])
    assert few["agree"] is None and "10" in few["reason"]


def test_depth_readings_dated_without_a_zone_pair_with_radar_dates():
    scenes = [
        {"datetime": "2026-10-19T11:45:54Z", "vv_db": -20.0},
        {"datetime": "2026-10-01T11:45:54Z", "vv_db": -9.0},
    ]
    pairs = sentinel1.pair_with_depth(scenes, ["2026-10-19", "2026-09-10"], [3.0, -12.0])
    assert pairs == [(True, True)]
