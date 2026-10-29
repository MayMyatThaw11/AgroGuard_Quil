import base64
import hashlib
import hmac
import json
import time
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models.user import User
from app.db.session import get_db_session


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _secret() -> bytes:
    secret = get_settings().jwt_secret
    if secret is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sign-in is not configured.",
        )
    return secret.get_secret_value().encode()


def sign_token(
    user_id: int, name: str | None = None, role: str | None = None, buyer_kind: str | None = None
) -> str:
    now = int(time.time())
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    claims = {"sub": str(user_id), "iat": now, "exp": now + get_settings().jwt_ttl_minutes * 60}
    if name:
        claims["name"] = name
    if role and role != "farmer":
        claims["role"] = role
    if buyer_kind:
        claims["buyer_kind"] = buyer_kind
    body = _b64(json.dumps(claims, separators=(",", ":")).encode())
    signature = hmac.new(_secret(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    return f"{header}.{body}.{_b64(signature)}"


def verify_token(token: str) -> int:
    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.")
    parts = token.split(".")
    if len(parts) != 3:
        raise invalid
    header, body, signature = parts
    expected = hmac.new(_secret(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    try:
        if not hmac.compare_digest(expected, _unb64(signature)):
            raise invalid
        if json.loads(_unb64(header)).get("alg") != "HS256":
            raise invalid
        claims = json.loads(_unb64(body))
        if int(claims["exp"]) < time.time():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired.")
        return int(claims["sub"])
    except (ValueError, KeyError, TypeError) as error:
        raise invalid from error


async def current_user(
    authorization: Annotated[str | None, Header()] = None,
    session: Annotated[AsyncSession, Depends(get_db_session)] = None,
) -> User:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in required.")
    user = await session.get(User, verify_token(token.strip()))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown user.")
    return user


async def require_service_key(x_service_key: Annotated[str | None, Header()] = None) -> None:
    expected = get_settings().internal_service_key
    if expected is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service key is not configured.",
        )
    supplied = (x_service_key or "").encode()
    if not hmac.compare_digest(supplied, expected.get_secret_value().encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service key.")
