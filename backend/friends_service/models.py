from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, Float, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Friendship(Base):
    """Tracks mutual friend connections. Both (A,B) and (B,A) rows exist when A and B are friends."""
    __tablename__ = "friendships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    follower_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    following_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follower_following"),
    )


class FriendRequest(Base):
    """Connection requests: from_user sends request to to_user; to_user can accept or reject."""
    __tablename__ = "friend_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    to_user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending | accepted | rejected
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("from_user_id", "to_user_id", name="uq_friend_request_pair"),
    )


class ReadingActivity(Base):
    """Logs reading events (opened, finished, highlighted) for a user and paper."""
    __tablename__ = "reading_activity"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    user_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    paper_id: Mapped[str] = mapped_column(String(100), nullable=False)
    paper_title: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # opened | finished | highlighted
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
