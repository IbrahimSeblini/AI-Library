"""Strict schema for Gemini-structured document output. Validate before storing."""
from __future__ import annotations

from typing import List
from pydantic import BaseModel, Field


class DocumentSection(BaseModel):
    heading: str = ""
    content: str = ""


class StructuredDocument(BaseModel):
    """Normalized academic document from the ingestion pipeline."""
    title: str = ""
    authors: List[str] = Field(default_factory=list)
    affiliations: List[str] = Field(default_factory=list)
    emails: List[str] = Field(default_factory=list)
    published_date: str = ""
    subject: str = ""
    abstract: str = ""
    keywords: List[str] = Field(default_factory=list)
    sections: List[DocumentSection] = Field(default_factory=list)
    references: List[str] = Field(default_factory=list)
    clean_full_text: str = ""

    def to_flat_text(self) -> str:
        """Build a single full text from sections for highlighting/search (fallback to clean_full_text)."""
        if self.clean_full_text and self.clean_full_text.strip():
            return self.clean_full_text.strip()
        parts = []
        for sec in self.sections:
            if sec.heading:
                parts.append(sec.heading)
            if sec.content:
                parts.append(sec.content)
        return "\n\n".join(parts) if parts else ""

    def body_only(self) -> str:
        """Main body text only (sections content), no title/author/abstract. Use for full_text storage."""
        if self.sections:
            return "\n\n".join(
                (sec.heading + "\n\n" + sec.content if sec.heading else sec.content)
                for sec in self.sections
                if sec.content or sec.heading
            ).strip()
        return (self.clean_full_text or "").strip()
