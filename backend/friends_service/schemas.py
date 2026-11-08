from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


# ── Friendship schemas ──────────────────────────────────────────

class FollowRequest(BaseModel):
    """Legacy: used for connect request (target_user_id = person to send request to)."""
    target_user_id: int


class FriendRequestOut(BaseModel):
    id: int
    from_user_id: int
    to_user_id: int
    from_user_name: str
    from_user_email: str
    status: str
    created_at: datetime
    responded_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FriendOut(BaseModel):
    id: int
    friend_id: int
    friend_name: str
    friend_email: str
    since: datetime

    class Config:
        from_attributes = True


# ── Reading Activity schemas ────────────────────────────────────

class ActivityCreate(BaseModel):
    paper_id: str
    paper_title: str
    action: str  # opened | finished | highlighted


class ActivityOut(BaseModel):
    id: int
    user_id: int
    user_name: str
    paper_id: str
    paper_title: str
    action: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Feed / Insights schemas ────────────────────────────────────

class FeedItem(BaseModel):
    id: int
    user_id: int
    user_name: str
    paper_id: str
    paper_title: str
    action: str
    created_at: datetime


class TrendingPaper(BaseModel):
    paper_id: str
    title: str
    read_count: int


class TrendingSubject(BaseModel):
    subject: str
    count: int


class ActiveReader(BaseModel):
    user_id: int
    name: str
    count: int


class ActiveReaderByTime(BaseModel):
    """Active reader ranked by total reading time (seconds)."""
    user_id: int
    name: str
    total_seconds: float
    formatted: str


class TrendingSubjectOut(BaseModel):
    """Subject/category trending among friends (from study tracker)."""
    subject: str
    count: int
    total_seconds: float


class InsightsOut(BaseModel):
    trending_papers: List[TrendingPaper]
    trending_subjects: List[TrendingSubjectOut]  # from study tracker
    most_active_readers: List[ActiveReader]  # by action count (legacy)
    most_active_readers_by_time: List[ActiveReaderByTime]  # top 5 by reading time
