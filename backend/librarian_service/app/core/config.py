from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
# Load backend/.env first (shared GEMINI_API_KEY etc.), then service-specific .env
load_dotenv(dotenv_path=BASE_DIR.parent / ".env")
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'librarian.db'}")
    LIBRARY_SERVICE_URL: str = os.getenv("LIBRARY_SERVICE_URL", "http://localhost:8002")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    VERTEX_AI_PROJECT: str = os.getenv("VERTEX_AI_PROJECT", "").strip()
    VERTEX_AI_LOCATION: str = os.getenv("VERTEX_AI_LOCATION", "").strip()


settings = Settings()

