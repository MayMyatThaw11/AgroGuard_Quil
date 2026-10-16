from collections.abc import Iterator

import pytest
from pydantic import SecretStr

from agriquill.config import get_settings

TEST_PIN = "1234"


@pytest.fixture(autouse=True)
def operator_pin() -> Iterator[None]:
    settings = get_settings()
    saved = settings.actuation_pin, settings.users, settings.write_token
    settings.actuation_pin = SecretStr(TEST_PIN)
    settings.users = None
    settings.write_token = None
    yield
    settings.actuation_pin, settings.users, settings.write_token = saved
