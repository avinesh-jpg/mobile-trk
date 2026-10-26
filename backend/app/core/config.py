from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Enterprise Field Tracker API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    DATABASE_URL: str
    SECRET_KEY: str = "supersecretjwtkey_mobiletracker_enterprise_2026_x99"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days
    GEMINI_API_KEY: Optional[str] = None
    # Map matching server. Public demo server is free but best-effort and driving-only;
    # point this at your own OSRM/Valhalla-compatible server for production.
    OSRM_BASE_URL: str = "https://router.project-osrm.org"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
