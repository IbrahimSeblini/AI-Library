"""One-time migration: add paper_title to group_papers if missing."""
from __future__ import annotations

from sqlalchemy import text
from .session import engine


def run_migrate_paper_title():
    """Add paper_title column to group_papers table if it does not exist."""
    with engine.connect() as conn:
        if "sqlite" in str(engine.url):
            r = conn.execute(text("PRAGMA table_info(group_papers)"))
            columns = [row[1] for row in r]
            if "paper_title" in columns:
                return
            conn.execute(text("ALTER TABLE group_papers ADD COLUMN paper_title VARCHAR(500)"))
            conn.commit()
        else:
            conn.execute(text(
                "ALTER TABLE group_papers ADD COLUMN IF NOT EXISTS paper_title VARCHAR(500)"
            ))
            conn.commit()
