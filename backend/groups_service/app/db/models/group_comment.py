from __future__ import annotations

from datetime import datetime
from sqlalchemy import Integer, String, Text, DateTime, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..base import Base


class GroupComment(Base):
    __tablename__ = "group_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("study_groups.id"), index=True)
    paper_id: Mapped[int] = mapped_column(Integer, index=True)  # Paper ID from library service
    user_id: Mapped[int] = mapped_column(Integer, index=True)  # User who created the comment
    commented_text: Mapped[str] = mapped_column(Text)  # The text that was commented on
    comment_text: Mapped[str] = mapped_column(Text)  # The actual comment
    start_offset: Mapped[int] = mapped_column(Integer)  # Character offset in document
    end_offset: Mapped[int] = mapped_column(Integer)  # Character offset in document
    context_before: Mapped[str] = mapped_column(Text, nullable=True)  # Text before for context
    context_after: Mapped[str] = mapped_column(Text, nullable=True)  # Text after for context
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationship
    group: Mapped["StudyGroup"] = relationship("StudyGroup", back_populates="comments")

