from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from .db.base import Base
from .db.session import engine
from .api.v1.routes import router
# Import models to ensure tables are created
from .db.models import Conversation, Message  # noqa

Base.metadata.create_all(bind=engine)

# Add title column to conversations if it doesn't exist (e.g. existing SQLite DBs)
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE conversations ADD COLUMN title VARCHAR(512)"))
        conn.commit()
    except Exception:
        conn.rollback()
        pass  # Column already exists or table not used yet

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE messages ADD COLUMN metadata_json TEXT"))
        conn.commit()
    except Exception:
        conn.rollback()
        pass

app = FastAPI(title="Librarian Service", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True, "service": "librarian"}

app.include_router(router, prefix="/api/v1")
