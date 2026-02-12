from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    TELEGRAM_BOT_TOKEN: str
    GEMINI_API_KEY: Optional[str] = None
    
    LLM_PROVIDER: str = "lmstudio" 
    LLM_MODEL_NAME: str = "qwen/qwen3-coder-30b"
    LLM_BASE_URL: Optional[str] = None
    
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
