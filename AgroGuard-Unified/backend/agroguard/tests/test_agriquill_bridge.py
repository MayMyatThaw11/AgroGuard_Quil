from unittest.mock import AsyncMock, patch

import httpx
import pytest
from pydantic import SecretStr

from app.schemas.sensor_observation import IngestObservationRequest
from app.services.observation import _bridge_to_agriquill


def _payload(**overrides) -> IngestObservationRequest:
    values = {"device_id": 7, "event_id": "e1", "temperature": 30.0, "humidity": 80.0}
    values.update(overrides)
    return IngestObservationRequest(**values)


@pytest.mark.asyncio
async def test_bridge_is_a_noop_without_a_configured_token() -> None:
    with patch("app.services.observation.get_settings") as get_settings:
        get_settings.return_value.agriquill_bridge_token = None
        with patch("app.services.observation.httpx.AsyncClient") as client_factory:
            await _bridge_to_agriquill(_payload())

    client_factory.assert_not_called()


@pytest.mark.asyncio
async def test_bridge_posts_temperature_and_humidity_with_the_write_token_header() -> None:
    with patch("app.services.observation.get_settings") as get_settings:
        get_settings.return_value.agriquill_bridge_token = SecretStr("bridge-token")
        get_settings.return_value.agriquill_bridge_reporter = "agroguard-bridge"
        get_settings.return_value.agriquill_api_url = "http://localhost:8010"

        mock_client = AsyncMock()
        mock_client.post.return_value = httpx.Response(
            200,
            json={"ok": True},
            request=httpx.Request("POST", "http://localhost:8010/api/v1/agriquill/telemetry/readings"),
        )
        with patch("app.services.observation.httpx.AsyncClient") as client_factory:
            client_factory.return_value.__aenter__.return_value = mock_client
            await _bridge_to_agriquill(_payload())

    mock_client.post.assert_called_once()
    url, kwargs = mock_client.post.call_args[0][0], mock_client.post.call_args[1]
    assert url == "http://localhost:8010/api/v1/agriquill/telemetry/readings"
    assert kwargs["json"]["device_id"] == "agroguard:7"
    assert kwargs["json"]["values"] == {"temperature_c": 30.0, "humidity_pct": 80.0}
    assert kwargs["json"]["reporter"] == "agroguard-bridge"
    assert kwargs["headers"]["X-AgriQuill-Write-Token"] == "bridge-token"


@pytest.mark.asyncio
async def test_bridge_skips_the_call_when_there_is_nothing_to_report() -> None:
    with patch("app.services.observation.get_settings") as get_settings:
        get_settings.return_value.agriquill_bridge_token = SecretStr("bridge-token")
        with patch("app.services.observation.httpx.AsyncClient") as client_factory:
            await _bridge_to_agriquill(_payload(temperature=None, humidity=None))

    client_factory.assert_not_called()


@pytest.mark.asyncio
async def test_bridge_failure_is_swallowed_not_raised() -> None:
    with patch("app.services.observation.get_settings") as get_settings:
        get_settings.return_value.agriquill_bridge_token = SecretStr("bridge-token")
        get_settings.return_value.agriquill_bridge_reporter = "agroguard-bridge"
        get_settings.return_value.agriquill_api_url = "http://localhost:8010"

        mock_client = AsyncMock()
        mock_client.post.side_effect = httpx.ConnectError("connection refused")
        with patch("app.services.observation.httpx.AsyncClient") as client_factory:
            client_factory.return_value.__aenter__.return_value = mock_client
            await _bridge_to_agriquill(_payload())  # must not raise


@pytest.mark.asyncio
async def test_council_record_goes_to_the_farm_vault_with_the_bridge_token() -> None:
    from app.api.v1.endpoints.council import _record_in_vault

    with patch("app.api.v1.endpoints.council.get_settings") as get_settings:
        get_settings.return_value.agriquill_bridge_token = SecretStr("bridge-token")
        get_settings.return_value.agriquill_bridge_reporter = "agroguard-bridge"
        get_settings.return_value.agriquill_api_url = "http://localhost:8010"
        mock_client = AsyncMock()
        url = "http://localhost:8010/api/v1/agriquill/farms/farm_a/vault/council"
        request = httpx.Request("POST", url)
        mock_client.post.return_value = httpx.Response(200, json={}, request=request)
        with patch("app.api.v1.endpoints.council.httpx.AsyncClient") as client_factory:
            client_factory.return_value.__aenter__.return_value = mock_client
            await _record_in_vault("farm_a", {"field_id": "P1"})

    assert mock_client.post.call_args[0][0] == url
    kwargs = mock_client.post.call_args[1]
    assert kwargs["json"] == {"evaluation": {"field_id": "P1"}, "sent_by": "agroguard-bridge"}
    assert kwargs["headers"]["X-AgriQuill-Write-Token"] == "bridge-token"


@pytest.mark.asyncio
async def test_council_record_failure_never_fails_the_evaluation() -> None:
    from app.api.v1.endpoints.council import _record_in_vault

    with patch("app.api.v1.endpoints.council.get_settings") as get_settings:
        get_settings.return_value.agriquill_bridge_token = SecretStr("bridge-token")
        get_settings.return_value.agriquill_api_url = "http://localhost:8010"
        mock_client = AsyncMock()
        mock_client.post.side_effect = httpx.ConnectError("connection refused")
        with patch("app.api.v1.endpoints.council.httpx.AsyncClient") as client_factory:
            client_factory.return_value.__aenter__.return_value = mock_client
            await _record_in_vault("farm_a", {})
