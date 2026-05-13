from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_env: str = "development"
    frontend_url: str = "http://localhost"
    api_url: str = "http://localhost/api"

    # DB
    database_url: str = "postgresql+asyncpg://subastas:devpassword@db:5432/subastas"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # Security
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    algorithm: str = "HS256"
    csrf_secret: str = "another-secret"

    # Stripe
    stripe_secret_key: Optional[str] = None
    stripe_publishable_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None
    stripe_connect_client_id: Optional[str] = None

    # Storage
    storage_backend: str = "local"
    local_storage_path: str = "/app/uploads"

    # Observability
    log_level: str = "INFO"
    otel_exporter_otlp_endpoint: Optional[str] = None
    otel_service_name: str = "subastas-api"

    # LFPIORPI caps (MXN)
    deposit_per_event_cap: float = 60_000.0
    deposit_30d_cap: float = 60_000.0
    deposit_annual_cap: float = 180_000.0

    # Payment & penalties
    payment_window_hours: int = 48
    penalty_enabled: bool = False
    penalty_percent: float = 10.0

    @property
    def async_database_url(self) -> str:
        return self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
