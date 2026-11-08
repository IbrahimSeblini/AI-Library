from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class NoteBase(BaseModel):
    paper_id: int
    content: str
    selected_text: Optional[str] = None
    start_offset: Optional[int] = None
    end_offset: Optional[int] = None
    paragraph_index: Optional[int] = None


class NoteCreate(NoteBase):
    pass


class NoteOut(NoteBase):
    id: int
    user_id: int
    paper_title: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NotesPaperSummaryOut(BaseModel):
    paper_id: int
    summary: str
    updated_at: datetime

    class Config:
        from_attributes = True
