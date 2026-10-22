from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.disease_advice import Decision, DiseaseAdvice
from app.services import decision_engine, disease_advice

router = APIRouter(tags=["disease-advice"])

ClassName = Annotated[str, Query(min_length=3, max_length=120)]
Language = Annotated[str, Query(pattern="^(en|my)$")]


@router.get(
    "/disease-advice",
    response_model=DiseaseAdvice,
    status_code=status.HTTP_200_OK,
    summary="Management advice for a detected plant disease",
)
def get_disease_advice(class_name: ClassName, language: Language = "en") -> dict:
    found = disease_advice.advice_for(class_name, language)
    if found is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"No management advice for {class_name}"
        )
    return found


@router.get(
    "/disease-decision",
    response_model=Decision,
    status_code=status.HTTP_200_OK,
    summary="Does a detected class need a spray or a fertilizer change?",
)
def get_disease_decision(class_name: ClassName, language: Language = "en") -> dict:
    found = decision_engine.decide(class_name, language)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Unknown class {class_name}")
    return found
