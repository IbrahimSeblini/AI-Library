from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


# ── Session schemas ─────────────────────────────────────────────

class SessionStart(BaseModel):
    activity_type: str          # reading | chatbot | groups | plagiarism | home
    category: Optional[str] = None
    paper_id: Optional[str] = None


class SessionEnd(BaseModel):
    pass  # just mark the open session as finished


class SessionOut(BaseModel):
    id: int
    user_id: int
    activity_type: str
    category: Optional[str]
    paper_id: Optional[str]
    started_at: datetime
    ended_at: Optional[datetime]
    duration_secs: Optional[float]

    class Config:
        from_attributes = True


# ── Weekly summary schemas ──────────────────────────────────────

class ActivityBreakdown(BaseModel):
    activity_type: str
    total_seconds: float
    formatted: str          # e.g. "2h 15m"


class CategoryBreakdown(BaseModel):
    category: str
    total_seconds: float
    formatted: str


class DailyPoint(BaseModel):
    date: str               # YYYY-MM-DD
    total_seconds: float
    formatted: str


class WeeklySummary(BaseModel):
    week_start: str         # YYYY-MM-DD (Monday)
    week_end: str           # YYYY-MM-DD (Sunday)
    total_seconds: float
    total_formatted: str    # e.g. "12h 30m"
    by_activity: List[ActivityBreakdown]
    by_category: List[CategoryBreakdown]     # reading categories only
    daily: List[DailyPoint]                  # 7 data points (Mon–Sun)


# ── Bulk reading stats (for friends insights) ────────────────────

class ReadingStatsBulkRequest(BaseModel):
    user_ids: List[int]     # list of user IDs to get reading stats for (e.g. friends)


class UserCategorySeconds(BaseModel):
    category: str
    total_seconds: float


class UserReadingStats(BaseModel):
    user_id: int
    total_seconds: float
    formatted: str
    by_category: List[UserCategorySeconds]


class ReadingStatsBulkResponse(BaseModel):
    users: List[UserReadingStats]


class ReadingSpeed(BaseModel):
    words_per_minute: float
    sample_size: int
    default_used: bool
