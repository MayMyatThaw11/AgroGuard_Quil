from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

AccountType = Literal["farmer", "buyer"]
BuyerKind = Literal["household", "retail", "restaurant", "cooperative", "processor"]


class DemoLoginRequest(BaseModel):
    email: str
    account_type: AccountType | None = None
    buyer_kind: BuyerKind | None = None

    @model_validator(mode="after")
    def buyer_needs_kind(self) -> "DemoLoginRequest":
        if self.account_type == "buyer" and self.buyer_kind is None:
            raise ValueError("a buyer account needs a buyer_kind")
        if self.account_type == "farmer":
            self.buyer_kind = None
        return self


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    display_name: str
    account_type: str = "farmer"
    buyer_kind: str | None = None


class MeResponse(BaseModel):
    id: int
    email: str
    display_name: str
    account_type: str = "farmer"
    buyer_kind: str | None = None


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
