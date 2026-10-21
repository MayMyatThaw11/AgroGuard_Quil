"""NASA POWER daily weather service. All HTTP is mocked: these tests never
reach NASA.
"""

from datetime import date, timedelta

import httpx
import pytest

from app.services import nasa_power

pytestmark = pytest.mark.asyncio


def _daily(**series) -> dict:
    return {
        "properties": {"parameter": series},
        "header": {"fill_value": -999.0},
    }


def _mock_http(monkeypatch, handler) -> list[httpx.Request]:
    seen: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    monkeypatch.setattr(
        nasa_power,
        "_client",
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(respond)),
    )
    return seen


async def test_fetch_daily_weather_maps_each_day_by_key(monkeypatch) -> None:
    _mock_http(
        monkeypatch,
        lambda r: httpx.Response(
            200,
            json=_daily(
                T2M={"20260101": 26.1, "20260102": 25.0},
                RH2M={"20260101": 68.0, "20260102": 70.0},
                PRECTOTCORR={"20260101": 0.0, "20260102": 2.5},
                ALLSKY_SFC_SW_DWN={"20260101": 17.5, "20260102": 16.8},
            ),
        ),
    )
    result = await nasa_power.fetch_daily_weather(16.87, 96.19, date(2026, 1, 1), date(2026, 1, 2))
    assert len(result.days) == 2
    assert result.days[0].day == date(2026, 1, 1)
    assert result.days[0].temperature == 26.1
    assert result.days[0].precipitation == 0.0  # genuine zero, not missing
    assert result.days[1].relative_humidity == 70.0
    assert result.warnings == []


async def test_fill_value_becomes_none_not_zero(monkeypatch) -> None:
    _mock_http(
        monkeypatch,
        lambda r: httpx.Response(
            200,
            json=_daily(
                T2M={"20260101": -999.0},
                RH2M={"20260101": 68.0},
                PRECTOTCORR={"20260101": 0.0},
                ALLSKY_SFC_SW_DWN={"20260101": 17.5},
            ),
        ),
    )
    result = await nasa_power.fetch_daily_weather(16.87, 96.19, date(2026, 1, 1), date(2026, 1, 1))
    assert result.days[0].temperature is None
    assert result.days[0].precipitation == 0.0
    assert "temperature" in result.warnings[0]


async def test_missing_day_key_is_also_none(monkeypatch) -> None:
    _mock_http(
        monkeypatch,
        lambda r: httpx.Response(
            200,
            json=_daily(T2M={}, RH2M={}, PRECTOTCORR={}, ALLSKY_SFC_SW_DWN={}),
        ),
    )
    result = await nasa_power.fetch_daily_weather(16.87, 96.19, date(2026, 1, 1), date(2026, 1, 1))
    day = result.days[0]
    assert day.temperature is None
    assert day.relative_humidity is None
    assert day.precipitation is None
    assert day.solar_radiation is None
    assert len(result.warnings) == 4


async def test_rejects_out_of_range_latitude() -> None:
    with pytest.raises(nasa_power.InvalidRequestError):
        await nasa_power.fetch_daily_weather(91.0, 0.0, date(2026, 1, 1), date(2026, 1, 1))


async def test_rejects_out_of_range_longitude() -> None:
    with pytest.raises(nasa_power.InvalidRequestError):
        await nasa_power.fetch_daily_weather(0.0, 181.0, date(2026, 1, 1), date(2026, 1, 1))


async def test_rejects_inverted_date_range() -> None:
    with pytest.raises(nasa_power.InvalidRequestError):
        await nasa_power.fetch_daily_weather(0.0, 0.0, date(2026, 1, 10), date(2026, 1, 1))


async def test_rejects_future_only_date_range() -> None:
    far_future = date.today() + timedelta(days=30)
    with pytest.raises(nasa_power.InvalidRequestError):
        await nasa_power.fetch_daily_weather(0.0, 0.0, far_future, far_future + timedelta(days=5))


async def test_rejects_excessive_date_range() -> None:
    start = date(2020, 1, 1)
    end = start + timedelta(days=nasa_power.MAX_RANGE_DAYS + 5)
    with pytest.raises(nasa_power.InvalidRequestError):
        await nasa_power.fetch_daily_weather(0.0, 0.0, start, end)


async def test_upstream_outage_raises_unavailable(monkeypatch) -> None:
    _mock_http(monkeypatch, lambda r: httpx.Response(503))
    with pytest.raises(nasa_power.NasaPowerUnavailableError):
        await nasa_power.fetch_daily_weather(16.87, 96.19, date(2026, 1, 1), date(2026, 1, 1))


async def test_malformed_json_raises_unavailable(monkeypatch) -> None:
    _mock_http(monkeypatch, lambda r: httpx.Response(200, text="not json"))
    with pytest.raises(nasa_power.NasaPowerUnavailableError):
        await nasa_power.fetch_daily_weather(16.87, 96.19, date(2026, 1, 1), date(2026, 1, 1))


async def test_missing_expected_shape_raises_unavailable(monkeypatch) -> None:
    _mock_http(monkeypatch, lambda r: httpx.Response(200, json={"unexpected": True}))
    with pytest.raises(nasa_power.NasaPowerUnavailableError):
        await nasa_power.fetch_daily_weather(16.87, 96.19, date(2026, 1, 1), date(2026, 1, 1))


# ── summarize_daily_weather (pure, no HTTP) ────────────────────────────────


def _result(*day_tuples):
    days = [
        nasa_power.DailyWeatherDay(
            day=date(2026, 1, i + 1), temperature=t, relative_humidity=h, precipitation=p, solar_radiation=s,
        )
        for i, (t, h, p, s) in enumerate(day_tuples)
    ]
    return nasa_power.DailyWeatherResult(
        latitude=0.0, longitude=0.0, start=days[0].day, end=days[-1].day, days=days,
    )


def test_summary_full_coverage_has_no_warnings_and_correct_totals() -> None:
    result = _result((20.0, 60.0, 0.0, 15.0), (22.0, 70.0, 5.0, 16.0))
    summary = nasa_power.summarize_daily_weather(result)
    assert summary.total_days == 2
    assert summary.valid_counts == {"temperature": 2, "relative_humidity": 2, "precipitation": 2, "solar_radiation": 2}
    assert summary.missing_counts == {"temperature": 0, "relative_humidity": 0, "precipitation": 0, "solar_radiation": 0}
    assert summary.total_precipitation_mm == 5.0
    assert summary.precipitation_coverage_complete is True
    assert summary.mean_temperature_c == 21.0
    assert summary.warnings == []


def test_summary_genuine_zero_rainfall_is_not_missing() -> None:
    result = _result((20.0, 60.0, 0.0, 15.0), (20.0, 60.0, 0.0, 15.0))
    summary = nasa_power.summarize_daily_weather(result)
    assert summary.total_precipitation_mm == 0.0
    assert summary.valid_counts["precipitation"] == 2
    assert summary.precipitation_coverage_complete is True


def test_summary_partial_coverage_warns_and_excludes_missing() -> None:
    result = _result((20.0, 60.0, 0.0, 15.0), (None, None, None, None))
    summary = nasa_power.summarize_daily_weather(result)
    assert summary.total_days == 2
    assert summary.valid_counts["temperature"] == 1
    assert summary.missing_counts["temperature"] == 1
    assert summary.precipitation_coverage_complete is False
    assert any("missing" in w for w in summary.warnings)
    # The mean/sum reflects only the one valid day, not an average treating the missing day as 0.
    assert summary.mean_temperature_c == 20.0
    assert summary.total_precipitation_mm == 0.0


def test_summary_excludes_implausible_negative_precipitation() -> None:
    result = _result((20.0, 60.0, -5.0, 15.0), (20.0, 60.0, 3.0, 15.0))
    summary = nasa_power.summarize_daily_weather(result)
    assert summary.total_precipitation_mm == 3.0
    assert summary.precipitation_coverage_complete is False
    assert any("implausible" in w for w in summary.warnings)


def test_summary_no_valid_days_returns_none_not_zero() -> None:
    result = _result((None, None, None, None))
    summary = nasa_power.summarize_daily_weather(result)
    assert summary.total_precipitation_mm is None
    assert summary.mean_temperature_c is None
