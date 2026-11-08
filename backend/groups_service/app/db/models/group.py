from __future__ import annotations

from datetime import datetime
from sqlalchemy import Integer, String, Text, Boolean, DateTime, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..base import Base


class StudyGroup(Base):
    __tablename__ = "study_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str] = mapped_column(Text)
    owner_id: Mapped[int] = mapped_column(Integer, index=True)  # User ID from auth service
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    members: Mapped[list] = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    invitations: Mapped[list] = relationship("GroupInvitation", back_populates="group", cascade="all, delete-orphan")
    papers: Mapped[list] = relationship("GroupPaper", back_populates="group", cascade="all, delete-orphan")
    highlights: Mapped[list] = relationship("GroupHighlight", back_populates="group", cascade="all, delete-orphan")
    comments: Mapped[list] = relationship("GroupComment", back_populates="group", cascade="all, delete-orphan")


class GroupMember(Base):
    __tablename__ = "group_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("study_groups.id"), index=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)  # User ID from auth service
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship
    group: Mapped["StudyGroup"] = relationship("StudyGroup", back_populates="members")

