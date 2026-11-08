from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db.base import Base
from .db.session import engine
from .api.v1.routes import router
# Import models to ensure tables are created
from .db.models import StudyGroup, GroupMember, GroupInvitation, GroupPaper, GroupHighlight, GroupComment, GroupNotesSummary, GroupPaperNotesSummary  # noqa
from .db.migrate_group_paper_title import run_migrate_paper_title

Base.metadata.create_all(bind=engine)
run_migrate_paper_title()

app = FastAPI(title="Groups Service", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True, "service": "groups"}

app.include_router(router, prefix="/api/v1")
