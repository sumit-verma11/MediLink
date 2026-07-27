from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_name: str = "all-MiniLM-L6-v2"
    specialty_map_path: str = "specialty_map.json"


settings = Settings()
