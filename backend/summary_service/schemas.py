from typing import Literal

from pydantic import BaseModel, Field

SummarySize = Literal["small", "medium", "large"]


class SummarizeRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Input text to summarize")
    size: SummarySize = Field(
        "medium",
        description="Summary length: small (1–2 sentences), medium (1 paragraph), large (2–3 paragraphs)",
    )


class SummarizeResponse(BaseModel):
    summary: str = Field(..., description="Generated summary")
    size: SummarySize = Field(..., description="Echo of requested size")
