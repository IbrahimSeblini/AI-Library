from __future__ import annotations

from datetime import datetime
from sqlalchemy import Integer, String, Text, DateTime, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..base import Base


class GroupHighlight(Base):
    __tablename__ = "group_highlights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("study_groups.id"), index=True)
    paper_id: Mapped[int] = mapped_column(Integer, index=True)  # Paper ID from library service
    user_id: Mapped[int] = mapped_column(Integer, index=True)  # User who created the highlight
    color: Mapped[str] = mapped_column(String(20), index=True)  # yellow, green, blue, pink, orange, purple, teal, red, cyan, lime
    highlighted_text: Mapped[str] = mapped_column(Text)
    start_offset: Mapped[int] = mapped_column(Integer)
    end_offset: Mapped[int] = mapped_column(Integer)
    context_before: Mapped[str] = mapped_column(Text, nullable=True)
    context_after: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship
    group: Mapped["StudyGroup"] = relationship("StudyGroup", back_populates="highlights")
