from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db.base import Base
from .db.session import engine
from .api.v1.routes import router
# Import models to ensure tables are created
from .db.models import Paper, Highlight, HighlightGroupTitle, HighlightColorSummary, Note, NotesPaperSummary  # noqa
from .db.migrate_owner_id import run_migrate_owner_id
from .db.migrate_structured_columns import run_migrate_structured_columns
from .db.migrate_notes import run_migrate_notes

Base.metadata.create_all(bind=engine)
run_migrate_owner_id()
run_migrate_structured_columns()
run_migrate_notes()

app = FastAPI(title="Library Service", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True, "service": "library"}

app.include_router(router, prefix="/api/v1")
