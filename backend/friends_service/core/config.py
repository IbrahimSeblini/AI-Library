from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)


class Settings:
    JWT_SECRET: str = os.getenv("JWT_SECRET", "changeme")
    JWT_ALG: str = os.getenv("JWT_ALG", "HS256")
    AUTH_SERVICE_URL: str = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")
    LIBRARY_SERVICE_URL: str = os.getenv("LIBRARY_SERVICE_URL", "http://localhost:8002")
    TRACKER_SERVICE_URL: str = os.getenv("TRACKER_SERVICE_URL", "http://localhost:8210")


settings = Settings()
