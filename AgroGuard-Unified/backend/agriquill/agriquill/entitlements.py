from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

import httpx
from fastapi import HTTPException

from .config import get_settings

CONSUME_PATH = "/api/v1/internal/entitlements/consume-farm"
RELEASE_PATH = "/api/v1/internal/entitlements/release-farm"


@dataclass(frozen=True)
class Reservation:
    user_id: int
    parcel_id: str


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def verify_claims(token: str, secret: str) -> dict:
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="invalid sign-in token")
    header, body, signature = parts
    expected = hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    try:
        if not hmac.compare_digest(expected, _unb64(signature)):
            raise HTTPException(status_code=401, detail="invalid sign-in token")
        if json.loads(_unb64(header)).get("alg") != "HS256":
            raise HTTPException(status_code=401, detail="invalid sign-in token")
        claims = json.loads(_unb64(body))
        if int(claims["exp"]) < time.time():
            raise HTTPException(status_code=401, detail="sign-in expired")
        int(claims["sub"])
        return claims
    except (ValueError, KeyError, TypeError, binascii.Error) as exc:
        raise HTTPException(status_code=401, detail="invalid sign-in token") from exc


def verify_jwt(token: str, secret: str) -> int:
    return int(verify_claims(token, secret)["sub"])


def _unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="plan check unavailable, try again shortly")


def _service_headers() -> dict[str, str]:
    key = get_settings().agroguard_service_key
    return {"X-Service-Key": key.get_secret_value() if key else ""}


async def consume_farm(authorization: str | None, parcel_id: str) -> Reservation | None:
    settings = get_settings()
    if not settings.agroguard_url:
        if settings.is_development:
            return None
        raise _unavailable()
    secret = settings.agroguard_jwt_secret
    if secret is None or settings.agroguard_service_key is None:
        raise _unavailable()
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="sign in to run a simulation")
    user_id = verify_jwt(token.strip(), secret.get_secret_value())
    try:
        async with httpx.AsyncClient(timeout=settings.agroguard_timeout_s) as client:
            response = await client.post(
                settings.agroguard_url.rstrip("/") + CONSUME_PATH,
                json={"user_id": user_id, "parcel_id": parcel_id},
                headers=_service_headers(),
            )
    except httpx.HTTPError as exc:
        if settings.is_development:
            return None
        raise _unavailable() from exc
    if response.status_code == 402:
        detail = response.json().get("detail") if response.content else None
        raise HTTPException(
            status_code=402,
            detail=detail if isinstance(detail, dict) else {"code": "farm_limit_reached"},
        )
    if response.status_code != 200:
        raise _unavailable()
    return Reservation(user_id, parcel_id)


async def release_farm(reservation: Reservation | None) -> None:
    settings = get_settings()
    if reservation is None or not settings.agroguard_url:
        return
    try:
        async with httpx.AsyncClient(timeout=settings.agroguard_timeout_s) as client:
            await client.post(
                settings.agroguard_url.rstrip("/") + RELEASE_PATH,
                json={"user_id": reservation.user_id, "parcel_id": reservation.parcel_id},
                headers=_service_headers(),
            )
    except httpx.HTTPError:
        return
