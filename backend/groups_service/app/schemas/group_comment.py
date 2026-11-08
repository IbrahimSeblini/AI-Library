from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class GroupCommentBase(BaseModel):
    paper_id: int
    commented_text: str
    comment_text: str
    start_offset: int
    end_offset: int
    context_before: Optional[str] = None
    context_after: Optional[str] = None


class GroupCommentCreate(GroupCommentBase):
    pass


class GroupCommentUpdate(BaseModel):
    comment_text: str


class GroupCommentOut(GroupCommentBase):
    id: int
    group_id: int
    user_id: int
    user_name: Optional[str] = None  # For frontend convenience
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

