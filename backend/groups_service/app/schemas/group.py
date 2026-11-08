from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class UserInfo(BaseModel):
    id: int
    name: str
    email: str


class PaperInfo(BaseModel):
    id: int
    title: str
    authors: List[str]
    publication_year: int
    subject: str
    summary: str
    added_by: Optional[int] = None  # User ID who added the paper


class GroupBase(BaseModel):
    name: str
    description: str
    is_public: bool


class GroupCreate(GroupBase):
    pass


class GroupOut(GroupBase):
    id: int
    owner_id: int
    members: List[UserInfo]
    papers: List[PaperInfo]
    created_at: datetime

    class Config:
        from_attributes = True


class InvitationBase(BaseModel):
    group_id: int
    invited_user_id: int


class InvitationCreate(BaseModel):
    """Create invitation - can use either user_id or email/username"""
    invited_user_id: Optional[int] = None
    email: Optional[str] = None  # Alternative to user_id
    username: Optional[str] = None  # Alternative to user_id (full_name)


class InvitationOut(InvitationBase):
    id: int
    inviter_id: int
    inviter_name: Optional[str] = None  # Added for frontend convenience
    inviter_email: Optional[str] = None  # Added for frontend convenience
    status: str
    created_at: datetime
    group_name: Optional[str] = None

    class Config:
        from_attributes = True


class InvitationResponse(BaseModel):
    response: str  # "accepted" or "declined"


class GroupUpdate(BaseModel):
    """Update group settings"""
    name: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None


class LeaveGroupRequest(BaseModel):
    """Request to leave a group - if owner, must provide new_owner_id if other members exist"""
    new_owner_id: Optional[int] = None  # Required if leaving owner and other members exist

