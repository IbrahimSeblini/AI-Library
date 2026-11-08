from __future__ import annotations

from datetime import datetime
from sqlalchemy import Integer, String, Text, DateTime, func, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from ..base import Base



class Highlight(Base):
    __tablename__ = "highlights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)  # User ID from auth service
    paper_id: Mapped[int] = mapped_column(Integer, ForeignKey("papers.id"), index=True)
    color: Mapped[str] = mapped_column(String(20), index=True)  # yellow, green, blue, pink, orange, purple, teal, red, cyan, lime
    highlighted_text: Mapped[str] = mapped_column(Text)  # The actual text that was highlighted
    start_offset: Mapped[int] = mapped_column(Integer)  # Character offset in document
    end_offset: Mapped[int] = mapped_column(Integer)  # Character offset in document
    context_before: Mapped[str] = mapped_column(Text, nullable=True)  # Text before highlight for context
    context_after: Mapped[str] = mapped_column(Text, nullable=True)  # Text after highlight for context
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HighlightGroupTitle(Base):
    """
    Cached AI-generated title for a (user, paper, color) highlight group.
    Only regenerated when the user explicitly clicks 'Refresh titles' in the
    paper's highlights side panel. Stored so the title persists across reloads
    without repeatedly calling the summary service.
    """
    __tablename__ = "highlight_group_titles"
    __table_args__ = (
        UniqueConstraint("user_id", "paper_id", "color", name="uq_highlight_group_title_user_paper_color"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    paper_id: Mapped[int] = mapped_column(Integer, ForeignKey("papers.id"), index=True)
    color: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(160))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class HighlightColorSummary(Base):
    """
    Cached AI summary for a user's full highlight group by color (across all papers).
    Shown automatically in MyHighlights; regenerated only on explicit user request.
    """
    __tablename__ = "highlight_color_summaries"
    __table_args__ = (
        UniqueConstraint("user_id", "color", name="uq_highlight_color_summary_user_color"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    color: Mapped[str] = mapped_column(String(20), index=True)
    summary: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
