import statistics
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.services.regional_market import (
    OutlierDetector,
    ProvenanceTag,
    Region,
    RegionalMarketService,
    UnquotedReason,
    clean_numeric_price,
    resolve_commodity,
    resolve_market_center,
)

PROVENANCE = Path(__file__).resolve().parents[1] / "app" / "data" / "PROVENANCE.md"


@pytest.fixture
def service() -> RegionalMarketService:
    return RegionalMarketService()


def test_naive_timestamp_is_treated_as_utc_and_goes_stale(service: RegionalMarketService) -> None:
    old = (datetime.now(UTC) - timedelta(days=400)).replace(tzinfo=None, microsecond=0).isoformat()
    service.ingest_raw_quote("Pathein", "Paw San", 480.0, "tonne", "USD", quote_timestamp=old)
    quote = service.get_quote("Pathein", "Paw San", live_only=True, max_age_days=7)
    assert quote.provenance == ProvenanceTag.UNQUOTED
    assert quote.unquoted_reason == UnquotedReason.STALE_FEED


def test_unparseable_timestamp_is_stale_not_fresh(service: RegionalMarketService) -> None:
    service.ingest_raw_quote("Pathein", "Paw San", 480.0, "tonne", "USD", quote_timestamp="last week")
    quote = service.get_quote("Pathein", "Paw San", live_only=True)
    assert quote.unquoted_reason == UnquotedReason.STALE_FEED


def test_constant_fallback_is_not_labelled_verified(service: RegionalMarketService) -> None:
    quote = service.get_quote("Taunggyi", "Mustard")
    assert quote.provenance == ProvenanceTag.UNQUOTED
    assert quote.unquoted_reason == UnquotedReason.MISSING_FEED_DATA
    assert quote.standardized is None


def test_typed_baseline_rows_are_not_historical_index(service: RegionalMarketService) -> None:
    quote = service.get_quote("Taunggyi", "Garlic")
    assert quote.provenance == ProvenanceTag.UNQUOTED


def test_historical_index_carries_dataset_source_not_now(service: RegionalMarketService) -> None:
    quote = service.get_quote("Taunggyi", "Maize")
    assert quote.provenance == ProvenanceTag.HISTORICAL_INDEX
    assert quote.price_usd_per_tonne == 281.5
    assert "ASEAN_Crop_Prices_Lookup.csv" in quote.source
    assert quote.quote_timestamp is None


def test_sweet_potato_does_not_overwrite_potato(service: RegionalMarketService) -> None:
    assert resolve_commodity("Sweet Potato")[0] != "potato"
    assert service.get_quote("Taunggyi", "Potato").price_usd_per_tonne == 686.65


def test_dataset_load_error_is_reported(tmp_path: Path) -> None:
    (tmp_path / "ASEAN_Crop_Prices_Lookup.csv").write_bytes(b"\xff\xfe\x00 not a csv \x00")
    broken = RegionalMarketService(data_dir=tmp_path)
    assert broken.load_errors
    assert "ASEAN_Crop_Prices_Lookup.csv" in broken.load_errors[0]


def test_zscore_uses_history_without_the_tested_value() -> None:
    history = [280.0, 281.0, 282.0, 283.0, 284.0, 280.0, 281.0, 282.0, 283.0, 284.0]
    is_out, _, metrics = OutlierDetector.evaluate_quote(297.0, "maize", history)
    expected = abs(297.0 - statistics.mean(history)) / statistics.stdev(history)
    assert is_out is True
    assert metrics["rule"] == "Z_SCORE_OUTLIER"
    assert metrics["z_score"] == pytest.approx(expected)


def test_zscore_needs_10_history_points() -> None:
    history = [280.0, 281.0, 282.0, 283.0, 284.0, 280.0, 281.0, 282.0, 283.0]
    is_out, _, metrics = OutlierDetector.evaluate_quote(297.0, "maize", history)
    assert is_out is False
    assert metrics.get("rule") != "Z_SCORE_OUTLIER"


def test_outlier_uses_regional_baseline_when_present() -> None:
    assert OutlierDetector.evaluate_quote(160.0, "maize", None)[0] is False
    is_out, _, metrics = OutlierDetector.evaluate_quote(160.0, "maize", None, baseline_usd=900.0)
    assert is_out is True
    assert metrics["baseline_median"] == 900.0


@pytest.mark.parametrize(("text", "value"), [("၁၅ သိန်း", 1_500_000.0), ("15 lakh", 1_500_000.0), ("2.5 lakhs", 250_000.0)])
def test_lakh_parsing(text: str, value: float) -> None:
    assert clean_numeric_price(text) == value


def test_bulletin_takes_price_next_to_currency(service: RegionalMarketService) -> None:
    [quote] = service.scrape_bulletin_text("Pathein: Paw San 46 lb basket 75,000 ks")
    assert quote.provenance == ProvenanceTag.MEASURED
    assert quote.raw_price == 75000.0
    assert quote.raw_unit == "basket"


def test_plain_rice_is_ambiguous(service: RegionalMarketService) -> None:
    assert resolve_commodity("rice") == (None, None)
    quote = service.ingest_raw_quote("Pathein", "rice", 400.0, "tonne", "USD")
    assert quote.unquoted_reason == UnquotedReason.UNSUPPORTED_COMMODITY
    assert "paddy or milled" in quote.notes
    assert resolve_commodity("paddy")[0] == "rice_emata"


def test_pawsan_history_not_copied_from_emata(service: RegionalMarketService) -> None:
    assert not service.price_history.get(("Pathein", "rice_pawsan"))


def test_township_csv_without_unit_is_not_price_history(service: RegionalMarketService) -> None:
    assert service.price_history == {}


def test_mawlamyine_is_mon_state() -> None:
    region, _ = resolve_market_center("Mawlamyine")
    assert region == Region.MON


def test_only_verified_files_feed_historical_index() -> None:
    text = PROVENANCE.read_text(encoding="utf-8")
    row = next(line for line in text.splitlines() if "`township_agricultural_data.csv`" in line)
    assert "synthetic" in row
    assert RegionalMarketService().price_history == {}
