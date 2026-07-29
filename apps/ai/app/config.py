from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(protected_namespaces=())

    model_name: str = "all-MiniLM-L6-v2"
    specialty_map_path: str = str(Path(__file__).resolve().parent.parent / "specialty_map.json")


settings = Settings()
