from __future__ import annotations

from datetime import datetime
from sqlalchemy import Integer, DateTime, String, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..base import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)  # User ID from auth service / gateway
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    title: Mapped[str | None] = mapped_column(String(512), nullable=True, default=None)  # User-defined name

    # Relationships
    messages: Mapped[list] = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")

