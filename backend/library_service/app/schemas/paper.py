from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class PaperBase(BaseModel):
    title: str
    authors: List[str]
    publication_year: int
    subject: str
    summary: str
    full_text: str


class PaperCreate(PaperBase):
    pass


class PaperOut(PaperBase):
    id: int
    created_at: datetime
    structured_content: Optional[str] = None  # JSON when ingested via PDF pipeline

    class Config:
        from_attributes = True


class PaperUpdate(BaseModel):
    title: str | None = None
    authors: List[str] | None = None
    publication_year: int | None = None
    subject: str | None = None
    summary: str | None = None
    full_text: str | None = None


class SearchFilters(BaseModel):
    subject: str | None = None
    author: str | None = None
    start_year: int | None = None
    end_year: int | None = None

