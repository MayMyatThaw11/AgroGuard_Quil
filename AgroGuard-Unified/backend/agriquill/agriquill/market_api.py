from fastapi import APIRouter, Depends, HTTPException

from .config import get_settings


def require_market() -> None:
    if not get_settings().farm_market_enabled:
        raise HTTPException(status_code=404, detail="Not found")


public = APIRouter(prefix="/market")
gated = APIRouter(prefix="/market", dependencies=[Depends(require_market)])


@public.get("/enabled")
async def enabled() -> dict[str, bool]:
    return {"enabled": get_settings().farm_market_enabled}


@gated.get("/status")
async def status() -> dict[str, bool]:
    return {"enabled": True}
