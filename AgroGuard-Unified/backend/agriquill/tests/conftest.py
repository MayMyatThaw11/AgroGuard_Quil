from collections.abc import Iterator

import pytest
from pydantic import SecretStr

from agriquill.config import get_settings

TEST_PIN = "1234"


@pytest.fixture(autouse=True)
def operator_pin() -> Iterator[None]:
    settings = get_settings()
    saved = settings.actuation_pin, settings.users, settings.write_token, settings.builtin_user
    settings.actuation_pin = SecretStr(TEST_PIN)
    settings.users = None
    settings.write_token = None
    settings.builtin_user = None
    yield
    (
        settings.actuation_pin,
        settings.users,
        settings.write_token,
        settings.builtin_user,
    ) = saved
