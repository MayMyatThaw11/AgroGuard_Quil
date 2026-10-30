from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill.api.main import create_app
from agriquill.config import Settings, get_settings

client = TestClient(create_app())
ME = "/api/v1/agriquill/auth/me"
BUILTIN = Settings.model_fields["builtin_user"].default


@pytest.fixture(autouse=True)
def builtin_sign_in() -> Iterator[None]:
    get_settings().builtin_user = BUILTIN
    yield


def test_builtin_user_is_the_farm_simulation_sign_in() -> None:
    assert BUILTIN is not None
    assert BUILTIN.get_secret_value() == "Farm Manager:FARMSIM-2026:manager,crew:*"


def test_builtin_code_signs_in_as_farm_manager_with_both_roles() -> None:
    res = client.get(ME, headers={"X-AgriQuill-Write-Token": "FARMSIM-2026"})
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Farm Manager"
    assert body["roles"] == ["buyer", "crew", "manager"]
    assert body["farms"] is None
    assert body["sign_in_required"] is True


def test_builtin_user_makes_the_name_and_code_gate_show() -> None:
    assert client.get(ME).status_code == 401
    assert client.get(ME, headers={"X-AgriQuill-Write-Token": "wrong"}).status_code == 401


def test_builtin_user_works_next_to_configured_users() -> None:
    get_settings().users = SecretStr("Ko Ko:111:crew")
    assert client.get(ME, headers={"X-AgriQuill-Write-Token": "111"}).json()["name"] == "Ko Ko"
    me = client.get(ME, headers={"X-AgriQuill-Write-Token": "FARMSIM-2026"}).json()
    assert me["name"] == "Farm Manager"


def test_empty_builtin_user_turns_the_gate_off() -> None:
    get_settings().builtin_user = SecretStr("")
    assert client.get(ME).json()["sign_in_required"] is False
