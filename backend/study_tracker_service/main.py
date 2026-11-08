from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import tracker as tracker_router

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Study Tracker Service", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "service": "study-tracker"}


app.include_router(tracker_router.router)
