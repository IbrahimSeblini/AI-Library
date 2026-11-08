from __future__ import annotations

from datetime import datetime
from sqlalchemy import Boolean, DateTime, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from ..base import Base


class GroupPaperNotesSummary(Base):
    __tablename__ = "group_paper_notes_summaries"
    __table_args__ = (UniqueConstraint("group_id", "paper_id", name="uq_group_paper_notes_summary"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(Integer, index=True)
    paper_id: Mapped[int] = mapped_column(Integer, index=True)
    available: Mapped[bool] = mapped_column(Boolean, default=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    highlight_count: Mapped[int] = mapped_column(Integer, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, default=0)
    meaningful_highlight_count: Mapped[int] = mapped_column(Integer, default=0)
    meaningful_comment_count: Mapped[int] = mapped_column(Integer, default=0)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GroupNotesSummary(Base):
    __tablename__ = "group_notes_summaries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    available: Mapped[bool] = mapped_column(Boolean, default=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    paper_count: Mapped[int] = mapped_column(Integer, default=0)
    papers_with_content: Mapped[int] = mapped_column(Integer, default=0)
    total_highlights: Mapped[int] = mapped_column(Integer, default=0)
    total_comments: Mapped[int] = mapped_column(Integer, default=0)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
