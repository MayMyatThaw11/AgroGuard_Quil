from datetime import datetime

from pydantic import BaseModel, Field


class DemoLoginRequest(BaseModel):
    email: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    display_name: str


class MeResponse(BaseModel):
    id: int
    email: str
    display_name: str


class EntitlementsResponse(BaseModel):
    plan: str
    status: str
    farms_used: int
    farms_limit: int | None
    farms_left: int | None
    current_period_end: datetime | None = None


class CheckoutRequest(BaseModel):
    card_number: str = Field(min_length=12, max_length=23)
    exp_month: int = Field(ge=1, le=12)
    exp_year: int = Field(ge=2000, le=2100)
    cvc: str = Field(min_length=3, max_length=4)


class CheckoutResponse(BaseModel):
    payment_id: int
    status: str
    card_last4: str
    entitlements: EntitlementsResponse


class FarmRequest(BaseModel):
    user_id: int
    parcel_id: str = Field(min_length=1, max_length=200)


class ConsumeFarmResponse(BaseModel):
    allowed: bool
    entitlements: EntitlementsResponse
