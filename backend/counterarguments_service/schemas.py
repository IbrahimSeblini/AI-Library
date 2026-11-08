from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(..., description="Message role: user or assistant")
    content: str = Field(..., min_length=1, description="Message text")


class CounterargumentRequest(BaseModel):
    context: str = Field(..., min_length=1, description="Text being challenged")
    messages: list[ChatMessage] = Field(default_factory=list)
    mode: str = Field(..., description="Request mode: initial or followup")


class CounterargumentResponse(BaseModel):
    reply: str = Field(..., description="Counterarguments assistant reply")
