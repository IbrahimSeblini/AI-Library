from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import friends as friends_router
from .routers import activity as activity_router

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Friends & Activity Service", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "service": "friends"}


app.include_router(friends_router.router)
app.include_router(activity_router.router)
