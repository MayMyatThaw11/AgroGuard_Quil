import base64
import json

import pytest
from pydantic import ValidationError

from app.api.v1.endpoints.auth import DEMO_USERS, account_for
from app.core.security import sign_token
from app.schemas.billing import DemoLoginRequest


def claims(token: str) -> dict:
    body = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))


def test_demo_login_buyer_claims_role() -> None:
    account_type, buyer_kind = account_for("buyer@demo.com", DemoLoginRequest(email="buyer@demo.com"))
    assert (account_type, buyer_kind) == ("buyer", "cooperative")
    token = claims(sign_token(7, "Buyer Demo", role=account_type, buyer_kind=buyer_kind))
    assert token["role"] == "buyer"
    assert token["buyer_kind"] == "cooperative"


def test_farmer_is_the_default_account() -> None:
    assert account_for("free@demo.com", DemoLoginRequest(email="free@demo.com")) == ("farmer", None)
    assert "role" not in claims(sign_token(1, "Free Demo"))


def test_sign_up_choice_is_used() -> None:
    req = DemoLoginRequest(email="free@demo.com", account_type="buyer", buyer_kind="household")
    assert account_for("free@demo.com", req) == ("buyer", "household")


def test_buyer_without_kind_is_rejected() -> None:
    with pytest.raises(ValidationError):
        DemoLoginRequest(email="x@demo.com", account_type="buyer")


def test_unknown_buyer_kind_is_rejected() -> None:
    with pytest.raises(ValidationError):
        DemoLoginRequest(email="x@demo.com", account_type="buyer", buyer_kind="spaceship")


def test_buyer_demo_user_exists() -> None:
    assert "buyer@demo.com" in DEMO_USERS


@pytest.mark.parametrize("kind", ["factory", "msme"])
def test_factory_and_msme_buyers_can_sign_up(kind: str) -> None:
    req = DemoLoginRequest(email="free@demo.com", account_type="buyer", buyer_kind=kind)
    assert account_for("free@demo.com", req) == ("buyer", kind)


def test_dev_email_gets_dev_account(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("AGROGUARD_DEV_EMAILS", '["lead@demo.com"]')
    get_settings.cache_clear()
    try:
        assert account_for("lead@demo.com", DemoLoginRequest(email="lead@demo.com")) == ("dev", None)
        assert account_for("free@demo.com", DemoLoginRequest(email="free@demo.com")) == ("farmer", None)
        chosen = DemoLoginRequest(email="lead@demo.com", account_type="buyer", buyer_kind="factory")
        assert account_for("lead@demo.com", chosen) == ("dev", None)
        assert claims(sign_token(5, "Lead", role="dev"))["role"] == "dev"
    finally:
        get_settings.cache_clear()
