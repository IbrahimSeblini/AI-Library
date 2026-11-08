from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from datetime import datetime


class MessageBase(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str


class MessageCreate(MessageBase):
    pass


class MessageOut(MessageBase):
    id: int
    conversation_id: int
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationBase(BaseModel):
    pass


class ConversationCreate(ConversationBase):
    pass


class ConversationRename(BaseModel):
    title: str


class ConversationImport(BaseModel):
    title: Optional[str] = None
    messages: List[MessageCreate]


class ConversationOut(ConversationBase):
    id: int
    user_id: int
    created_at: datetime
    title: Optional[str] = None
    messages: List[MessageOut] = []

    class Config:
        from_attributes = True


class SendMessageRequest(BaseModel):
    content: str
    conversation_id: Optional[int] = None  # If None, creates a new conversation


class SendMessageResponse(BaseModel):
    conversation_id: int
    message: MessageOut
    assistant_message: MessageOut
