from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class HighlightBase(BaseModel):
    paper_id: int
    color: str  # yellow, green, blue, pink, orange, purple, teal, red, cyan, lime
    highlighted_text: str
    start_offset: int
    end_offset: int
    context_before: Optional[str] = None
    context_after: Optional[str] = None


class HighlightCreate(HighlightBase):
    pass


class HighlightOut(HighlightBase):
    id: int
    user_id: int
    paper_title: Optional[str] = None  # For convenience in frontend
    created_at: datetime

    class Config:
        from_attributes = True


class HighlightGroup(BaseModel):
    color: str
    highlights: list[HighlightOut]


class HighlightGroupTitleOut(BaseModel):
    color: str
    title: str
    updated_at: datetime

    class Config:
        from_attributes = True


class HighlightGroupTitleWithPaperOut(BaseModel):
    paper_id: int
    color: str
    title: str
    updated_at: datetime

    class Config:
        from_attributes = True


class HighlightColorSummaryOut(BaseModel):
    color: str
    summary: str
    updated_at: datetime

    class Config:
        from_attributes = True
