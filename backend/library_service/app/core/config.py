from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'library.db'}")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    INGESTION_PAGE_LIMIT: int = int(os.getenv("INGESTION_PAGE_LIMIT", "50"))
    INGESTION_FILE_SIZE_MB: float = float(os.getenv("INGESTION_FILE_SIZE_MB", "25.0"))


settings = Settings()

