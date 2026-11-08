from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class PaperNotesSummaryOut(BaseModel):
    group_id: int
    paper_id: int
    available: bool
    summary: Optional[str]
    highlight_count: int
    comment_count: int
    meaningful_highlight_count: int
    meaningful_comment_count: int
    generated_at: Optional[datetime] = None


class PaperSummaryBlock(BaseModel):
    paper_id: int
    paper_title: str
    highlight_count: int
    comment_count: int
    has_content: bool


class GroupNotesSummaryOut(BaseModel):
    group_id: int
    available: bool
    summary: Optional[str]
    paper_count: int
    papers_with_content: int
    total_highlights: int
    total_comments: int
    paper_blocks: List[PaperSummaryBlock]
    generated_at: Optional[datetime] = None
