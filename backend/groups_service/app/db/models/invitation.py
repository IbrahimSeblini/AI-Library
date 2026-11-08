from __future__ import annotations

from datetime import datetime
from sqlalchemy import Integer, String, Enum as SQLEnum, DateTime, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from ..base import Base


class InvitationStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class GroupInvitation(Base):
    __tablename__ = "group_invitations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("study_groups.id"), index=True)
    inviter_id: Mapped[int] = mapped_column(Integer, index=True)  # User ID from auth service
    invited_user_id: Mapped[int] = mapped_column(Integer, index=True)  # User ID from auth service
    status: Mapped[InvitationStatus] = mapped_column(SQLEnum(InvitationStatus), default=InvitationStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship
    group: Mapped["StudyGroup"] = relationship("StudyGroup", back_populates="invitations")

