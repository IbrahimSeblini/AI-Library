"""Add raw_extracted_text and structured_content columns to papers for ingestion pipeline."""
from __future__ import annotations

from sqlalchemy import text
from .session import engine


def run_migrate_structured_columns():
    with engine.connect() as conn:
        if "sqlite" in str(engine.url):
            r = conn.execute(text("PRAGMA table_info(papers)"))
            columns = [row[1] for row in r]
            if "raw_extracted_text" not in columns:
                conn.execute(text("ALTER TABLE papers ADD COLUMN raw_extracted_text TEXT"))
            if "structured_content" not in columns:
                conn.execute(text("ALTER TABLE papers ADD COLUMN structured_content TEXT"))
            conn.commit()
        else:
            conn.execute(text("ALTER TABLE papers ADD COLUMN IF NOT EXISTS raw_extracted_text TEXT"))
            conn.execute(text("ALTER TABLE papers ADD COLUMN IF NOT EXISTS structured_content TEXT"))
            conn.commit()
