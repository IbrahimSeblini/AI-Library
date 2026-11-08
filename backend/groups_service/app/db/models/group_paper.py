from __future__ import annotations

from datetime import datetime
from sqlalchemy import Integer, String, DateTime, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..base import Base


class GroupPaper(Base):
    __tablename__ = "group_papers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("study_groups.id"), index=True)
    paper_id: Mapped[int] = mapped_column(Integer, index=True)  # Paper ID in adder's library
    paper_title: Mapped[str | None] = mapped_column(String(500), nullable=True)  # Cached for display; no access to other users' docs
    added_by: Mapped[int] = mapped_column(Integer, index=True)  # User ID from auth service
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship
    group: Mapped["StudyGroup"] = relationship("StudyGroup", back_populates="papers")

