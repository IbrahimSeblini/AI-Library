from __future__ import annotations

from sqlalchemy import text

from .session import engine


def run_migrate_notes():
    with engine.connect() as conn:
        if "sqlite" in str(engine.url):
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS notes (
                        id INTEGER PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        paper_id INTEGER NOT NULL,
                        content TEXT NOT NULL,
                        selected_text TEXT,
                        start_offset INTEGER,
                        end_offset INTEGER,
                        paragraph_index INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY(paper_id) REFERENCES papers(id)
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_notes_id ON notes (id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_notes_user_id ON notes (user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_notes_paper_id ON notes (paper_id)"))
            conn.commit()
            return

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS notes (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    paper_id INTEGER NOT NULL REFERENCES papers(id),
                    content TEXT NOT NULL,
                    selected_text TEXT NULL,
                    start_offset INTEGER NULL,
                    end_offset INTEGER NULL,
                    paragraph_index INTEGER NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_notes_user_id ON notes (user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_notes_paper_id ON notes (paper_id)"))
        conn.commit()
