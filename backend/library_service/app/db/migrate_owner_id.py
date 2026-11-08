"""One-time migration: add owner_id to papers if missing and backfill existing rows."""
from __future__ import annotations

from sqlalchemy import text
from .session import engine


def run_migrate_owner_id():
    """Add owner_id column to papers table if it does not exist; backfill existing rows with 1."""
    with engine.connect() as conn:
        # SQLite: check if column exists
        if "sqlite" in str(engine.url):
            r = conn.execute(text("PRAGMA table_info(papers)"))
            columns = [row[1] for row in r]
            if "owner_id" in columns:
                return
            conn.execute(text("ALTER TABLE papers ADD COLUMN owner_id INTEGER"))
            conn.execute(text("UPDATE papers SET owner_id = 1 WHERE owner_id IS NULL"))
            conn.commit()
        else:
            # PostgreSQL etc.: add column if not exists
            conn.execute(text(
                "ALTER TABLE papers ADD COLUMN IF NOT EXISTS owner_id INTEGER"
            ))
            conn.execute(text("UPDATE papers SET owner_id = 1 WHERE owner_id IS NULL"))
            conn.commit()
