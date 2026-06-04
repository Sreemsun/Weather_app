from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openweather_api_key: str = ""
    openweather_api_base_url: str = "https://api.openweathermap.org/data/2.5"
    openweather_onecall_base_url: str = "https://api.openweathermap.org/data/2.5/onecall"
    openweather_geo_base_url: str = "https://api.openweathermap.org/geo/1.0"
    youtube_api_key: str = ""
    backend_cors_origins: str = "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:4173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
