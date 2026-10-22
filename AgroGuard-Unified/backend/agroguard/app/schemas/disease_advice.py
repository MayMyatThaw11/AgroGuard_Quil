from typing import Literal

from app.schemas.base import APIModel


class SprayKind(APIModel):
    label: str
    ingredients: list[str]


class SprayTier(APIModel):
    # shown: ingredient examples are listed. awaiting_review: listing is switched off until a
    # reviewer signs the disease off. not_applicable: no spray is called for.
    status: Literal["shown", "awaiting_review", "not_applicable"]
    when: list[str]
    kinds: list[SprayKind]
    safety: list[str]


class Decision(APIModel):
    """Whether a spray and a fertilizer change are needed, and what to tell the farmer."""

    class_name: str
    label: str
    category: Literal["disease", "healthy", "not_a_plant", "fruit_grade"]
    needs_spray: bool
    spray_type: str
    spray_recommendation: str
    needs_fertilizer: bool
    fertilizer_action: str
    fertilizer_recommendation: str


class DiseaseAdvice(APIModel):
    class_name: str
    cause: str
    cause_label: str
    steps: list[str]
    decision: Decision
    spray: SprayTier
    reviewed_by: str | None = None
    reviewed_on: str | None = None
    disclaimer: str
