from typing import Literal

from app.schemas.base import APIModel

ScenarioChoice = Literal["hold", "irrigate", "dry"]


class WaterScenarioRequest(APIModel):
    scenarios: list[ScenarioChoice] = ["hold", "irrigate", "dry"]


class WaterScenarioResponse(APIModel):
    field_id: int
    requested_scenarios: list[ScenarioChoice]
    status: Literal["unavailable"]
    reason: str
    measurement: str = "soil_moisture"
    unit: str = "%"
