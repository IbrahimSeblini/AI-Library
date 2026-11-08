from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class GroupHighlightBase(BaseModel):
    paper_id: int
    color: str  # yellow, green, blue, pink, orange, purple, teal, red, cyan, lime
    highlighted_text: str
    start_offset: int
    end_offset: int
    context_before: Optional[str] = None
    context_after: Optional[str] = None


class GroupHighlightCreate(GroupHighlightBase):
    pass


class GroupHighlightOut(GroupHighlightBase):
    id: int
    group_id: int
    user_id: int
    user_name: Optional[str] = None  # For frontend convenience
    created_at: datetime

    class Config:
        from_attributes = True
