from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class StudySession(Base):
    """
    Tracks a single study session / time-block for a user.

    activity_type: 'reading' | 'chatbot' | 'groups' | 'plagiarism' | 'home'
    category:      For reading — the paper's subject (e.g. "Machine Learning").
                   For other activities — null / empty.
    paper_id:      If reading, the paper being read; otherwise null.
    duration_secs: Seconds spent in this session (computed when session ends).
    """
    __tablename__ = "study_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    paper_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_secs: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
