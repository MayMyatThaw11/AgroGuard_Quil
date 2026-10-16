from datetime import UTC, datetime, timedelta

import pytest

from agriquill import rehearse
from agriquill.farmers import lift_volume_m3

BAND = {
    "p10": [-12.0, -14.0, -16.0, -18.0],
    "p50": [-11.0, -13.0, -15.0, -17.0],
    "p90": [-10.0, -12.0, -14.0, -16.0],
}
DAYS = [
    {"date": "2026-10-15", "rain_mm": 0.0},
    {"date": "2026-10-16", "rain_mm": 10.0},
    {"date": "2026-10-17", "rain_mm": 0.0},
    {"date": "2026-10-18", "rain_mm": 5.0},
]


def test_three_options_share_one_water_balance():
    out = rehearse.rehearse(BAND, DAYS, 1, 5.0, -15.0, 2.0)
    hold, act, dry = (out["branches"][k] for k in ("hold", "act", "dry"))
    assert hold["p50"] == BAND["p50"]
    assert act["p50"] == [-11.0, 5.0, 3.0, 1.0]
    assert dry["p50"] == [-11.0, 4.0, 2.0, -0.5]
    assert all(d <= a for d, a in zip(dry["p50"], act["p50"], strict=True))
    assert hold["days_below_floor"] == 2 and hold["first_breach_day"] == 2
    assert act["days_below_floor"] == 0 and act["first_breach_day"] is None
    assert out["water_m3"] == lift_volume_m3(2.0, 18.0) == 3600.0
    assert out["status"] == rehearse.STATUS


def test_approved_option_counts_only_from_the_action_day():
    band = {"p10": [-19.0, -21.0], "p50": [-18.0, -20.0], "p90": [-17.0, -19.0]}
    days = [{"date": "2026-10-15", "rain_mm": 30.0}, {"date": "2026-10-16", "rain_mm": 4.0}]
    out = rehearse.rehearse(band, days, 1, 5.0, -15.0, 1.0)
    assert out["branches"]["hold"]["first_breach_day"] == 0
    assert out["branches"]["act"]["first_breach_day"] is None
    assert out["branches"]["act"]["counted_from_day"] == 1
    assert out["forecast_rain_mm"] == 4.0
    assert out["branches"]["dry"]["p50"][1] == 4.6


def test_action_day_is_clamped_and_band_restarts_after_it():
    out = rehearse.rehearse(BAND, DAYS, 9, 5.0, -15.0, 1.0)
    assert out["action_day"] == 3
    act = out["branches"]["act"]
    assert act["p90"][3] - act["p50"][3] == pytest.approx(1.28, abs=0.01)
    with pytest.raises(ValueError):
        rehearse.rehearse({"p10": [], "p50": [], "p90": []}, [], 0, 5.0, -15.0, 1.0)


def test_rehearsal_digest_is_stable():
    out = rehearse.rehearse(BAND, DAYS, 1, 5.0, -15.0, 2.0)
    assert rehearse.digest(out) == rehearse.digest(dict(reversed(list(out.items()))))


def row(town, lat, lon, spi_class):
    return {
        "town": town,
        "lat": lat,
        "lon": lon,
        "spi3": -1.2,
        "spiClass": spi_class,
        "rainPercentile": 12,
        "rainPeriod": "2026-09",
        "rain30Mm": 80.0,
        "et0MmDay": 4.1,
        "evaporation": {"ratio": 0.6},
        "riceYieldTHa": 3.9,
        "riceYieldYear": 2024,
        "sources": {"chirps": "sha256:x"},
        "builtAt": "2026-10-13T00:00:00+00:00",
    }


def test_season_context_uses_the_nearest_region_and_weights_dry_seasons():
    rows = [row("Maubin", 16.731, 95.654, "moderately dry"), row("Far", 10.0, 105.0, "near normal")]
    near = rehearse.season_context(16.728, 95.591, rows)
    assert near["town"] == "Maubin" and near["distance_km"] < 10
    assert near["stress_weight"] == "likely"
    assert near["sources"]["rain_and_spi"].startswith("CHIRPS")
    wet = rehearse.season_context(16.728, 95.591, [row("Maubin", 16.731, 95.654, "very wet")])
    assert wet["stress_weight"] == "possible"


def test_season_context_refuses_to_guess_far_away():
    out = rehearse.season_context(0.0, 0.0, [row("Maubin", 16.731, 95.654, "near normal")])
    assert "beyond 75 km" in out["missing"][0]["reason"]


def test_snapshot_covers_the_demo_cooperative():
    out = rehearse.season_context(16.72834, 95.59059)
    assert out.get("town", "").startswith("Maubin"), out


def test_score_compares_the_first_reading_after_the_job():
    out = rehearse.rehearse(BAND, DAYS, 1, 5.0, -15.0, 2.0)
    end = "2026-10-16T08:00"
    early = {"observed_at": "2026-10-16T10:00:00+00:00", "value": 9.0, "sha256": "a"}
    later = {"observed_at": "2026-10-16T15:00:00+00:00", "value": 4.0, "sha256": "b"}
    scored = rehearse.score(out, [later, early], end, 0)
    assert scored["reading_sha256"] == "b" and scored["day"] == 1
    assert scored["predicted_cm"] == 5.0 and scored["error_cm"] == -1.0
    assert scored["closer_to"] == "act"
    assert rehearse.score(out, [early], end, 0) is None
    dry_field = {"observed_at": "2026-10-17T06:00:00+00:00", "value": -14.0, "sha256": "c"}
    assert rehearse.score(out, [dry_field], end, 0)["closer_to"] == "hold"


def test_score_ignores_readings_outside_the_rehearsed_days():
    out = rehearse.rehearse(BAND, DAYS, 1, 5.0, -15.0, 2.0)
    stamp = (datetime(2026, 10, 25, tzinfo=UTC) + timedelta(hours=1)).isoformat()
    assert (
        rehearse.score(out, [{"observed_at": stamp, "value": 1.0}], "2026-10-16T08:00", 0) is None
    )
