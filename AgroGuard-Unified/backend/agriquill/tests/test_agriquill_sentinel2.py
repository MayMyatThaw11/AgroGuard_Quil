import zlib

import numpy as np
import pytest

from agriquill.data import sentinel2

REFERENCE_ITEM = "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2B_46QGE_20260822_0_L2A"
TILE_WEST_X = 699960.0
TILE_TOP_Y = 2000040.0
TILE_SIZE_M = 109800.0


def test_utm_matches_the_provider_tile_corners():
    e, n = sentinel2.utm_from_lonlat(18.079810667508067, 94.88944607243496, 46)
    assert abs(e - TILE_WEST_X) < 15 and abs(n - TILE_TOP_Y) < 15
    e, n = sentinel2.utm_from_lonlat(17.088787242146395, 94.8791758901503, 46)
    assert abs(e - TILE_WEST_X) < 15
    assert TILE_TOP_Y - TILE_SIZE_M < n < TILE_TOP_Y


def test_utm_central_meridian_on_the_equator_is_the_false_origin():
    e, n = sentinel2.utm_from_lonlat(0.0, 93.0, 46)
    assert abs(e - 500000.0) < 1e-6 and abs(n) < 1e-6


def test_zone_comes_from_the_epsg_code_and_rejects_others():
    assert sentinel2.zone_of(32646) == (46, False)
    assert sentinel2.zone_of(32747) == (47, True)
    with pytest.raises(sentinel2.SentinelError):
        sentinel2.zone_of(4326)


def _encode(tile: np.ndarray) -> bytes:
    diff = tile.copy()
    diff[:, 1:] = (tile[:, 1:].astype(np.int64) - tile[:, :-1].astype(np.int64)) % 65536
    return zlib.compress(diff.astype("<u2").tobytes())


def test_deflate_tile_with_horizontal_predictor_decodes_exactly():
    rng = np.random.default_rng(7)
    tile = rng.integers(0, 65535, size=(4, 6), dtype=np.uint16)
    tags = {"tile_w": 6, "tile_h": 4, "bits": 16, "predictor": 2, "byte_order": "<"}
    assert np.array_equal(sentinel2.decode_tile(_encode(tile), tags), tile)


def test_pixel_mask_keeps_only_pixel_centres_inside_the_ring():
    transform = [10.0, 0.0, 1000.0, 0.0, -10.0, 2000.0]
    ring = [
        (1000.0, 2000.0),
        (1030.0, 2000.0),
        (1030.0, 1980.0),
        (1000.0, 1980.0),
        (1000.0, 2000.0),
    ]
    mask = sentinel2.pixel_mask(ring, transform, 0, 0, 3, 5)
    assert mask.shape == (3, 5)
    assert mask[:2, :3].all() and not mask[2:, :].any() and not mask[:, 3:].any()


def _bands(red: float, nir: float, green: float, scl: int, shape=(4, 4)):
    def dn(r: float) -> np.ndarray:
        return np.full(shape, round((r + 0.1) / 0.0001), dtype=np.uint16)

    return dn(red), dn(nir), dn(green), np.full(shape, scl, dtype=np.uint8)


SCALE = {"scale": 0.0001, "offset": -0.1}


def test_clear_scene_gives_ndvi_and_ndwi_from_published_scale_and_offset():
    red, nir, green, scl = _bands(0.05, 0.45, 0.08, 4)
    out = sentinel2.scene_stats(
        "S2X_TEST", "2026-10-18T04:23:09Z", 12.0, red, nir, green, scl, np.ones((4, 4), bool), SCALE
    )
    assert out["scene_id"] == "S2X_TEST"
    assert out["status"] == "clear" and out["clear_pixels"] == 16
    assert out["ndvi"] == pytest.approx((0.45 - 0.05) / (0.45 + 0.05), abs=1e-3)
    assert out["ndwi"] == pytest.approx((0.08 - 0.45) / (0.08 + 0.45), abs=1e-3)


def test_cloudy_scene_is_reported_null_with_a_reason_never_filled():
    red, nir, green, scl = _bands(0.05, 0.45, 0.08, 9)
    out = sentinel2.scene_stats(
        "S2X_CLOUD",
        "2026-10-13T04:23:09Z",
        88.0,
        red,
        nir,
        green,
        scl,
        np.ones((4, 4), bool),
        SCALE,
    )
    assert out["status"] == "cloudy"
    assert out["ndvi"] is None and out["ndwi"] is None
    assert "clear" in out["reason"] and out["scene_id"] == "S2X_CLOUD"


def test_partly_cloudy_scene_uses_only_clear_pixels():
    red, nir, green, scl = _bands(0.05, 0.45, 0.08, 4)
    scl[:1, :] = 9
    red[:1, :] = 5000
    out = sentinel2.scene_stats(
        "S2X_PART", "2026-10-08T04:23:09Z", 30.0, red, nir, green, scl, np.ones((4, 4), bool), SCALE
    )
    assert out["clear_pixels"] == 12 and out["status"] == "clear"
    assert out["ndvi"] == pytest.approx(0.8, abs=1e-3)


def test_series_keeps_cloudy_dates_as_gaps_in_date_order():
    scenes = [
        {
            "scene_id": "B",
            "datetime": "2026-10-13T04:00:00Z",
            "status": "cloudy",
            "ndvi": None,
            "ndwi": None,
        },
        {
            "scene_id": "A",
            "datetime": "2026-10-08T04:00:00Z",
            "status": "clear",
            "ndvi": 0.6,
            "ndwi": -0.4,
        },
        {
            "scene_id": "C",
            "datetime": "2026-10-18T04:00:00Z",
            "status": "clear",
            "ndvi": 0.62,
            "ndwi": -0.41,
        },
    ]
    series = sentinel2.as_series(scenes)
    assert [s["scene_id"] for s in series] == ["A", "B", "C"]
    assert series[1]["ndvi"] is None
    assert all(s["scene_id"] for s in series)


def test_one_pass_seen_by_two_tiles_counts_once_keeping_the_clearer_scene():
    def scene(sid: str, when: str, clear: int, ndvi: float | None) -> dict:
        status = "clear" if ndvi is not None else "cloudy"
        return {
            "scene_id": sid,
            "datetime": when,
            "status": status,
            "clear_pixels": clear,
            "ndvi": ndvi,
            "ndwi": None,
        }

    series = sentinel2.as_series(
        [
            scene("S2A_46QGE_20261018", "2026-10-18T04:23:09Z", 40, 0.79),
            scene("S2A_47QKV_20261018", "2026-10-18T04:23:05Z", 120, 0.78),
            scene("S2A_46QGE_20261013", "2026-10-13T04:23:09Z", 0, None),
        ]
    )
    assert [s["scene_id"] for s in series] == ["S2A_46QGE_20261013", "S2A_47QKV_20261018"]
    assert series[1]["also"] == ["S2A_46QGE_20261018"]
    assert "also" not in series[0]


def test_physically_impossible_pixels_are_dropped_and_counted_never_averaged():
    red, nir, green, scl = _bands(0.05, 0.45, 0.08, 4)
    red[:, :2] = 300
    out = sentinel2.scene_stats(
        "S2X_BAD", "2026-10-13T04:00:00Z", 5.0, red, nir, green, scl, np.ones((4, 4), bool), SCALE
    )
    assert out["invalid_pixels"] == 8
    assert -1 <= out["ndvi"] <= 1
    assert out["ndvi"] == pytest.approx(0.8, abs=1e-3)


def test_reads_collection_one_with_consistent_offsets():
    assert sentinel2.COLLECTION == "sentinel-2-c1-l2a"
