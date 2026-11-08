from __future__ import annotations

from datetime import datetime
from sqlalchemy import Integer, String, Text, DateTime, func, ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from ..base import Base


class Paper(Base):
    """Papers belong to a single owner (user). Each user has their own personal library."""
    __tablename__ = "papers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    owner_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)  # None = legacy shared; otherwise user's private library
    title: Mapped[str] = mapped_column(String(500), index=True)
    authors: Mapped[str] = mapped_column(Text)  # JSON string of authors array
    publication_year: Mapped[int] = mapped_column(Integer, index=True)
    subject: Mapped[str] = mapped_column(String(255), index=True)
    summary: Mapped[str] = mapped_column(Text)
    full_text: Mapped[str] = mapped_column(Text)
    # Ingestion pipeline: raw extract + structured JSON (academic-reader format)
    raw_extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    structured_content: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON: sections, abstract, references, etc.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

