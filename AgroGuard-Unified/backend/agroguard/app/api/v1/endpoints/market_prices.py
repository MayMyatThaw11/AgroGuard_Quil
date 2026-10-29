import hmac
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.core.config import get_settings
from app.core.security import verify_token
from app.services import regional_market, rtfp

router = APIRouter(tags=["market"])


async def service_or_user(
    x_service_key: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    expected = get_settings().internal_service_key
    if expected is not None and x_service_key and hmac.compare_digest(
        x_service_key.encode(), expected.get_secret_value().encode()
    ):
        return
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in or send a service key.")
    verify_token(token.strip())


def _measured(market: str | None, produce: str) -> dict[str, Any] | None:
    if not market:
        return None
    quote = regional_market.regional_market_service.get_quote(market, produce, live_only=True)
    if quote.provenance != regional_market.ProvenanceTag.MEASURED or quote.standardized is None:
        return None
    return {
        "status": "ok",
        "provenance": "measured",
        "produce": produce,
        "market": quote.market_center,
        "as_of": quote.quote_timestamp,
        "latest_mmk_kg": quote.standardized.price_mmk_per_kg,
        "change_3m_pct": None,
        "unit": "MMK/kg",
        "source": {"provider": quote.source, "url": None, "retrieved_at": quote.quote_timestamp},
    }


@router.get(
    "/market/prices",
    summary="One price for a produce near a place, with its provenance",
    dependencies=[Depends(service_or_user)],
)
async def market_prices(
    produce: Annotated[str, Query(min_length=1, max_length=40)],
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    market: Annotated[str | None, Query(max_length=80)] = None,
) -> dict[str, Any]:
    measured = _measured(market, produce)
    if measured is not None:
        return measured
    return rtfp.trend(produce, lat, lon)
