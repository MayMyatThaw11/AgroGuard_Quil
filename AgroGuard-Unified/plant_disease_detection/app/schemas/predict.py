from pydantic import BaseModel, Field
from typing import List, Optional


class PredictionResponse(BaseModel):
    healthScore: int = Field(..., description="0 to 100 overall plant health score")
    plantName: str = Field(..., description="Display name of the detected crop")
    scientificName: str = Field(..., description="Botanical scientific name")
    healthStatus: str = Field(..., description="Healthy, Mild Infection, Moderate Infection, Severe Infection, or Invalid Image")
    detectedDisease: str = Field(..., description="Human-readable disease name")
    confidenceScore: float = Field(..., description="Model confidence percentage (0-100)")
    diseaseSeverity: str = Field(..., description="Estimated severity level")
    estimatedAffectedArea: str = Field(..., description="Estimated affected plant surface area")
    visibleSymptoms: List[str] = Field(default_factory=list)
    possibleCauses: List[str] = Field(default_factory=list)
    treatmentRecommendations: List[str] = Field(default_factory=list)
    preventionRecommendations: List[str] = Field(default_factory=list)
    groupUsed: Optional[str] = None
    rawClassName: Optional[str] = None