import os
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from models import Base

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = os.getenv("JUDGE_DB_PATH", str(BASE_DIR / "judge.db"))
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def _run_migrations():
    with engine.connect() as conn:
        # Safe add-column migrations — ignore if columns already exist
        migrations = [
            "ALTER TABLE judgments ADD COLUMN latency_ms INTEGER",
            "ALTER TABLE judgments ADD COLUMN model_used TEXT DEFAULT 'gemini-2.5-flash'",
            "ALTER TABLE judgments ADD COLUMN test_case_id INTEGER",
            "ALTER TABLE judgments ADD COLUMN test_case_description TEXT",
        ]
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass
