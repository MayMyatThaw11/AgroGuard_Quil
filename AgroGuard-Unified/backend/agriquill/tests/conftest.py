from collections.abc import Iterator

import pytest
from pydantic import SecretStr

from agriquill import safety
from agriquill.config import get_settings

TEST_PIN = "1234"


@pytest.fixture(autouse=True)
def operator_pin() -> Iterator[None]:
    settings = get_settings()
    saved = (
        settings.actuation_pin,
        settings.users,
        settings.write_token,
        settings.builtin_user,
        settings.environment,
        settings.agroguard_url,
        settings.agroguard_jwt_secret,
        settings.agroguard_service_key,
    )
    settings.agroguard_url = None
    settings.agroguard_jwt_secret = None
    settings.agroguard_service_key = None
    settings.actuation_pin = SecretStr(TEST_PIN)
    settings.users = None
    settings.write_token = None
    settings.builtin_user = None
    settings.environment = "development"  # the server default is production (fails closed)
    safety.reset_rate_limits()
    yield
    (
        settings.actuation_pin,
        settings.users,
        settings.write_token,
        settings.builtin_user,
        settings.environment,
        settings.agroguard_url,
        settings.agroguard_jwt_secret,
        settings.agroguard_service_key,
    ) = saved
    safety.reset_rate_limits()
