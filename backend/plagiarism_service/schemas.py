from pydantic import BaseModel
from typing import List


class CheckRequest(BaseModel):
    text: str
    top_k: int = 5


class Match(BaseModel):
    id: str
    title: str | None = None
    score: float


class CheckResponse(BaseModel):
    query: str
    matches: List[Match]
