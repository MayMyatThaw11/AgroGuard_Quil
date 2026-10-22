from __future__ import annotations

from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
KEYS_FILE = str(BACKEND_DIR / "keys.env")


DEVELOPMENT = "development"
# Sign-in, approval and webhook secrets. API keys for data providers are left
# alone: their blank values are matched by existing provider code.
BLANK_MEANS_UNSET = (
    "write_token",
    "users",
    "builtin_user",
    "actuation_pin",
    "telemetry_webhook_token",
    "telemetry_ttn_token",
    "telemetry_chirpstack_token",
)


class Settings(BaseSettings):
    # Fails closed: a forgotten variable means "production", where sign-in is
    # mandatory and the built-in demo sign-in is off. Local runs set
    # AGRIQUILL_ENVIRONMENT=development (npm run start does this itself).
    environment: str = "production"
    soilgrids_endpoint: str = "https://rest.isric.org/soilgrids/v2.0/properties/query"
    openmeteo_endpoint: str = "https://api.open-meteo.com/v1/forecast"
    open_meteo_elevation_url: str = "https://api.open-meteo.com/v1/elevation"
    open_meteo_flood_url: str = "https://flood-api.open-meteo.com/v1/flood"
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
    # Shared fallback; prefer one token per network so one leak can't forge the other.
    telemetry_webhook_token: SecretStr | None = None
    telemetry_ttn_token: SecretStr | None = None
    telemetry_chirpstack_token: SecretStr | None = None
    # The AgroGuard bridge posts readings for its own sensors ("agroguard:<id>"),
    # which no farm contract declares. Only this named user may do that.
    bridge_user: str = "agroguard-bridge"
    bridge_device_prefix: str = "agroguard:"
    # Actuation approval limits (in memory, per server process).
    pin_failures_per_caller: int = 5
    pin_failures_global: int = 20
    pin_failure_window_s: float = 600.0
    approvals_per_minute_per_caller: int = 5
    approvals_per_minute_global: int = 30
    actuation_pin: SecretStr | None = None
    write_token: SecretStr | None = None
    users: SecretStr | None = None
    # Built-in Farm Simulation sign-in (name:code:roles[:farms]), always accepted
    # alongside AGRIQUILL_USERS. Override with AGRIQUILL_BUILTIN_USER, or set it
    # empty to turn it off.
    # Honoured only when environment is "development": a code that is public in
    # the source must never open a production server.
    builtin_user: SecretStr | None = SecretStr("Farm Manager:FARMSIM-2026:manager,crew:*")
    public_farms: str = "farm_ayeyarwady_demo"
    nasa_power_endpoint: str = "https://power.larc.nasa.gov/api/temporal/daily/point"
    chirps_base: str = "https://data.chc.ucsb.edu/products/CHIRPS-2.0"
    earth_search_url: str = "https://earth-search.aws.element84.com/v1"
    planetary_computer_url: str = "https://planetarycomputer.microsoft.com/api/stac/v1"
    planetary_computer_sas_url: str = "https://planetarycomputer.microsoft.com/api/sas/v1/token"
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

    @field_validator(*BLANK_MEANS_UNSET, mode="before")
    @classmethod
    def _blank_is_unset(cls, value: object) -> object:
        # "AGRIQUILL_WRITE_TOKEN=" as shipped in .env.example is not a configured
        # secret. Without this a blank value looked set, and sign-in checks passed.
        return None if isinstance(value, str) and not value.strip() else value

    @property
    def is_development(self) -> bool:
        return self.environment.strip().lower() == DEVELOPMENT


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
