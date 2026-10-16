from __future__ import annotations

from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
KEYS_FILE = str(BACKEND_DIR / "keys.env")


class Settings(BaseSettings):
    environment: str = "development"
    soilgrids_endpoint: str = "https://rest.isric.org/soilgrids/v2.0/properties/query"
    openmeteo_endpoint: str = "https://api.open-meteo.com/v1/forecast"
    http_timeout_s: float = 30.0
    soil_cache_ttl_s: float = 180 * 24 * 3600.0
    weather_cache_ttl_s: float = 3600.0
    sim_day_count: int = 120
    wind_ceiling_ms: float = 5.5
    spray_wind_advisory_ms: float = 3.0
    valve_max_minutes: float = 180.0
    ledger_path: str = str(BACKEND_DIR / "data" / "agriquill_ledger.jsonl")
    data_dir: str = str(BACKEND_DIR / "data")
    knowledge_root: str = str(Path(__file__).resolve().parents[2])
    job_interval_s: float = 0.0
    watch_interval_s: float = 0.0
    scheduler_time_limit_s: float = 5.0
    telemetry_webhook_token: SecretStr | None = None
    actuation_pin: SecretStr | None = None
    write_token: SecretStr | None = None
    users: SecretStr | None = None
    public_farms: str = "farm_ayeyarwady_demo"
    nasa_power_endpoint: str = "https://power.larc.nasa.gov/api/temporal/daily/point"
    chirps_base: str = "https://data.chc.ucsb.edu/products/CHIRPS-2.0"
    crop_calendar_endpoint: str = "https://api-cropcalendar.apps.fao.org/api/v1"
    faostat_api: str = "https://faostatservices.fao.org/api/v1"
    faostat_bulk_url: str = (
        "https://bulks-faostat.fao.org/production/"
        "Production_Crops_Livestock_E_All_Data_(Normalized).zip"
    )
    faostat_token: SecretStr | None = None
    pinksheet_url: str = (
        "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/"
        "related/CMO-Historical-Data-Monthly.xlsx"
    )
    faostat_username: str | None = None
    faostat_password: SecretStr | None = None
    gleam_host: str = "aether.ugent.be"
    gleam_port: int = 2225
    gleam_user: str | None = None
    gleam_password: SecretStr | None = None
    gfw_api: str = "https://data-api.globalforestwatch.org"
    gfw_api_key: SecretStr | None = None
    gfw_jwt: SecretStr | None = None
    global_fishing_watch_api: str = "https://gateway.api.globalfishingwatch.org/v3"
    global_fishing_watch_token: SecretStr | None = None

    model_config = SettingsConfigDict(
        env_prefix="AGRIQUILL_",
        env_file=(KEYS_FILE, ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
