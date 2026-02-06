from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    TELEGRAM_BOT_TOKEN: str
    GOOGLE_API_KEY: Optional[str] = None
    
    LLM_PROVIDER: str = "google-gla" # options: google-gla, openai, ollama
    LLM_MODEL_NAME: str = "gemini-3.0-flash"
    LLM_BASE_URL: Optional[str] = None
    
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
