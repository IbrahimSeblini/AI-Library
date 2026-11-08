from fastapi import APIRouter, Depends, HTTPException, Header, Query, Body
from sqlalchemy.orm import Session
from typing import List, Optional
import httpx
from pydantic import BaseModel
from ...db.session import get_db
from ...db.models.group import StudyGroup, GroupMember
from ...db.models.invitation import GroupInvitation, InvitationStatus
from ...db.models.group_paper import GroupPaper
from ...db.models.group_highlight import GroupHighlight
from ...db.models.group_comment import GroupComment
from ...db.models.group_notes_summary import GroupNotesSummary, GroupPaperNotesSummary
from ...schemas.group import GroupOut, GroupCreate, InvitationOut, InvitationCreate, InvitationResponse, UserInfo, PaperInfo, GroupUpdate, LeaveGroupRequest
from ...schemas.group_highlight import GroupHighlightCreate, GroupHighlightOut
from ...schemas.group_comment import GroupCommentCreate, GroupCommentUpdate, GroupCommentOut
from ...schemas.notes_summary import PaperNotesSummaryOut, PaperSummaryBlock, GroupNotesSummaryOut
from ...services.notes_summarizer import generate_paper_summary, generate_group_summary, is_meaningful
from ...core.config import settings

router = APIRouter(tags=["groups"])


async def get_user_from_auth_service(user_id: int) -> Optional[dict]:
    """Fetch user info from auth service"""
    try:
        async with httpx.AsyncClient() as client:
            # Fetch from auth service
            response = await client.get(
                f"{settings.AUTH_SERVICE_URL}/auth/users/{user_id}",
                timeout=5.0
            )
            if response.status_code == 200:
                user_data = response.json()
                return {
                    "id": user_data.get("id", user_id),
                    "name": user_data.get("full_name") or user_data.get("email", "").split("@")[0] or f"User {user_id}",
                    "email": user_data.get("email", f"user{user_id}@example.com")
                }
    except Exception as e:
        # Log error in production, but continue with fallback
        pass
    # Fallback: return basic structure if auth service unavailable
    return {"id": user_id, "name": f"User {user_id}", "email": f"user{user_id}@example.com"}


async def get_paper_from_library_service(paper_id: int, owner_user_id: Optional[int] = None) -> Optional[dict]:
    """Fetch paper from library service. owner_user_id required: library returns only papers owned by that user."""
    try:
        base = settings.LIBRARY_SERVICE_URL
        headers = {}
        if owner_user_id is not None:
            headers["X-User-Id"] = str(owner_user_id)
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{base.rstrip('/')}/api/v1/papers/{paper_id}", headers=headers or None)
            if response.status_code == 200:
                return response.json()
    except Exception:
        pass
    return None


def _paper_info_from_group_paper(p: GroupPaper, title: str) -> PaperInfo:
    """Build PaperInfo from stored title (no library fetch; preserves privacy)."""
    return PaperInfo(
        id=p.paper_id,
        title=title,
        authors=[],
        publication_year=0,
        subject="",
        summary="",
        added_by=p.added_by
    )


def _is_member(db: Session, group_id: int, user_id: Optional[int]) -> bool:
    if user_id is None:
        return False
    return db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == user_id,
    ).first() is not None


def _assert_member(db: Session, group: StudyGroup, user_id: int) -> None:
    if group.owner_id == user_id or _is_member(db, group.id, user_id):
        return
    raise HTTPException(status_code=403, detail="You must be a member of this group")


async def _build_group_out(
    group: StudyGroup,
    db: Session,
    viewer_user_id: Optional[int],
    include_members: bool,
    include_papers: bool,
    redact_member_emails: bool = False,
) -> GroupOut:
    user_infos = []
    if include_members:
        members = db.query(GroupMember).filter(GroupMember.group_id == group.id).all()
        for m in members:
            user = await get_user_from_auth_service(m.user_id)
            if user:
                if redact_member_emails:
                    user = {**user, "email": ""}
                user_infos.append(UserInfo(**user))

    paper_infos = []
    if include_papers:
        papers = db.query(GroupPaper).filter(GroupPaper.group_id == group.id).all()
        for p in papers:
            if p.paper_title:
                paper_infos.append(_paper_info_from_group_paper(p, p.paper_title))
            else:
                paper = await get_paper_from_library_service(p.paper_id, owner_user_id=p.added_by or viewer_user_id)
                if paper:
                    paper_infos.append(PaperInfo(
                        id=paper["id"],
                        title=paper["title"],
                        authors=paper["authors"],
                        publication_year=paper["publication_year"],
                        subject=paper["subject"],
                        summary=paper["summary"],
                        added_by=p.added_by
                    ))
                else:
                    paper_infos.append(_paper_info_from_group_paper(p, f"Paper {p.paper_id}"))

    return GroupOut(
        id=group.id,
        name=group.name,
        description=group.description,
        is_public=group.is_public,
        owner_id=group.owner_id,
        members=user_infos,
        papers=paper_infos,
        created_at=group.created_at
    )


def _remove_user_group_data(db: Session, group_id: int, user_id: int) -> None:
    """Remove private contributions a user shared with a group when they leave."""
    paper_ids = [
        row[0]
        for row in db.query(GroupPaper.paper_id).filter(
            GroupPaper.group_id == group_id,
            GroupPaper.added_by == user_id,
        ).all()
    ]
    if paper_ids:
        db.query(GroupHighlight).filter(
            GroupHighlight.group_id == group_id,
            GroupHighlight.paper_id.in_(paper_ids),
        ).delete(synchronize_session=False)
        db.query(GroupComment).filter(
            GroupComment.group_id == group_id,
            GroupComment.paper_id.in_(paper_ids),
        ).delete(synchronize_session=False)
        db.query(GroupPaper).filter(
            GroupPaper.group_id == group_id,
            GroupPaper.added_by == user_id,
        ).delete(synchronize_session=False)

    db.query(GroupHighlight).filter(
        GroupHighlight.group_id == group_id,
        GroupHighlight.user_id == user_id,
    ).delete(synchronize_session=False)
    db.query(GroupComment).filter(
        GroupComment.group_id == group_id,
        GroupComment.user_id == user_id,
    ).delete(synchronize_session=False)


def _empty_paper_notes_summary(group_id: int, paper_id: int) -> PaperNotesSummaryOut:
    return PaperNotesSummaryOut(
        group_id=group_id,
        paper_id=paper_id,
        available=False,
        summary=None,
        highlight_count=0,
        comment_count=0,
        meaningful_highlight_count=0,
        meaningful_comment_count=0,
        generated_at=None,
    )


def _paper_summary_out(row: GroupPaperNotesSummary) -> PaperNotesSummaryOut:
    return PaperNotesSummaryOut(
        group_id=row.group_id,
        paper_id=row.paper_id,
        available=row.available,
        summary=row.summary,
        highlight_count=row.highlight_count,
        comment_count=row.comment_count,
        meaningful_highlight_count=row.meaningful_highlight_count,
        meaningful_comment_count=row.meaningful_comment_count,
        generated_at=row.updated_at or row.generated_at,
    )


def _empty_group_notes_summary(group_id: int, paper_blocks: Optional[List[PaperSummaryBlock]] = None) -> GroupNotesSummaryOut:
    return GroupNotesSummaryOut(
        group_id=group_id,
        available=False,
        summary=None,
        paper_count=len(paper_blocks or []),
        papers_with_content=0,
        total_highlights=0,
        total_comments=0,
        paper_blocks=paper_blocks or [],
        generated_at=None,
    )


def _group_summary_out(row: GroupNotesSummary, paper_blocks: List[PaperSummaryBlock]) -> GroupNotesSummaryOut:
    return GroupNotesSummaryOut(
        group_id=row.group_id,
        available=row.available,
        summary=row.summary,
        paper_count=row.paper_count,
        papers_with_content=row.papers_with_content,
        total_highlights=row.total_highlights,
        total_comments=row.total_comments,
        paper_blocks=paper_blocks,
        generated_at=row.updated_at or row.generated_at,
    )


async def _collect_paper_notes_data(
    db: Session,
    group_id: int,
    paper_id: int,
) -> tuple[GroupPaper, list[GroupHighlight], list[GroupComment], dict[int, str], str]:
    group_paper = db.query(GroupPaper).filter(
        GroupPaper.group_id == group_id,
        GroupPaper.paper_id == paper_id
    ).first()
    if not group_paper:
        raise HTTPException(status_code=404, detail="Paper not found in this group")

    highlights = db.query(GroupHighlight).filter(
        GroupHighlight.group_id == group_id,
        GroupHighlight.paper_id == paper_id
    ).all()
    comments = db.query(GroupComment).filter(
        GroupComment.group_id == group_id,
        GroupComment.paper_id == paper_id
    ).all()

    user_ids = {h.user_id for h in highlights} | {c.user_id for c in comments}
    user_map = {}
    for uid in user_ids:
        user_info = await get_user_from_auth_service(uid)
        user_map[uid] = user_info.get("name", f"User {uid}") if user_info else f"User {uid}"

    if group_paper.paper_title:
        paper_title = group_paper.paper_title
    else:
        paper_info = await get_paper_from_library_service(paper_id, owner_user_id=group_paper.added_by)
        paper_title = paper_info.get("title", f"Paper {paper_id}") if paper_info else f"Paper {paper_id}"

    return group_paper, highlights, comments, user_map, paper_title


async def _regenerate_paper_notes_summary(db: Session, group_id: int, paper_id: int) -> PaperNotesSummaryOut:
    _, highlights, comments, user_map, paper_title = await _collect_paper_notes_data(db, group_id, paper_id)

    meaningful_highlight_count = sum(1 for h in highlights if is_meaningful(h.highlighted_text))
    meaningful_comment_count = sum(1 for c in comments if is_meaningful(c.comment_text))
    available, summary_text = await generate_paper_summary(highlights, comments, user_map, paper_title)

    row = db.query(GroupPaperNotesSummary).filter(
        GroupPaperNotesSummary.group_id == group_id,
        GroupPaperNotesSummary.paper_id == paper_id,
    ).first()
    if not row:
        row = GroupPaperNotesSummary(group_id=group_id, paper_id=paper_id)
        db.add(row)

    row.available = available
    row.summary = summary_text
    row.highlight_count = len(highlights)
    row.comment_count = len(comments)
    row.meaningful_highlight_count = meaningful_highlight_count
    row.meaningful_comment_count = meaningful_comment_count
    db.commit()
    db.refresh(row)
    return _paper_summary_out(row)


async def _collect_group_notes_data(
    db: Session,
    group: StudyGroup,
) -> tuple[list[dict], dict[int, str], list[PaperSummaryBlock], int, int, int]:
    group_papers = db.query(GroupPaper).filter(GroupPaper.group_id == group.id).all()
    all_user_ids = set()
    per_paper_data = []

    for gp in group_papers:
        highlights = db.query(GroupHighlight).filter(
            GroupHighlight.group_id == group.id,
            GroupHighlight.paper_id == gp.paper_id
        ).all()
        comments = db.query(GroupComment).filter(
            GroupComment.group_id == group.id,
            GroupComment.paper_id == gp.paper_id
        ).all()
        all_user_ids.update(h.user_id for h in highlights)
        all_user_ids.update(c.user_id for c in comments)
        per_paper_data.append({
            "paper_id": gp.paper_id,
            "paper_title": gp.paper_title,
            "highlights": highlights,
            "comments": comments,
            "added_by": gp.added_by,
        })

    user_map = {}
    for uid in all_user_ids:
        user_info = await get_user_from_auth_service(uid)
        user_map[uid] = user_info.get("name", f"User {uid}") if user_info else f"User {uid}"

    paper_blocks = []
    total_highlights = 0
    total_comments = 0
    papers_with_content = 0

    for entry in per_paper_data:
        if entry.get("paper_title"):
            paper_title = entry["paper_title"]
        else:
            paper_info = await get_paper_from_library_service(entry["paper_id"], owner_user_id=entry.get("added_by"))
            paper_title = paper_info.get("title", f"Paper {entry['paper_id']}") if paper_info else f"Paper {entry['paper_id']}"
        entry["paper_title"] = paper_title

        h_count = len(entry["highlights"])
        c_count = len(entry["comments"])
        total_highlights += h_count
        total_comments += c_count

        meaningful_h = sum(1 for h in entry["highlights"] if is_meaningful(h.highlighted_text))
        meaningful_c = sum(1 for c in entry["comments"] if is_meaningful(c.comment_text))
        has_content = meaningful_h > 0 or meaningful_c > 0
        if has_content:
            papers_with_content += 1

        paper_blocks.append(PaperSummaryBlock(
            paper_id=entry["paper_id"],
            paper_title=paper_title,
            highlight_count=h_count,
            comment_count=c_count,
            has_content=has_content,
        ))

    return per_paper_data, user_map, paper_blocks, total_highlights, total_comments, papers_with_content


async def _regenerate_group_notes_summary(db: Session, group: StudyGroup) -> GroupNotesSummaryOut:
    per_paper_data, user_map, paper_blocks, total_highlights, total_comments, papers_with_content = await _collect_group_notes_data(db, group)
    available, summary_text = await generate_group_summary(per_paper_data, user_map, group.name)

    row = db.query(GroupNotesSummary).filter(GroupNotesSummary.group_id == group.id).first()
    if not row:
        row = GroupNotesSummary(group_id=group.id)
        db.add(row)

    row.available = available
    row.summary = summary_text
    row.paper_count = len(paper_blocks)
    row.papers_with_content = papers_with_content
    row.total_highlights = total_highlights
    row.total_comments = total_comments
    db.commit()
    db.refresh(row)
    return _group_summary_out(row, paper_blocks)


async def search_user_by_email_or_username(email: Optional[str] = None, username: Optional[str] = None) -> Optional[dict]:
    """Search for a user by email or username in auth service"""
    try:
        async with httpx.AsyncClient() as client:
            search_query = email or username or ""
            if not search_query:
                return None
            
            response = await client.get(
                f"{settings.AUTH_SERVICE_URL}/auth/users/search",
                params={"q": search_query},
                timeout=5.0
            )
            if response.status_code == 200:
                users = response.json()
                # Find exact match by email first, then by username
                if email:
                    user = next((u for u in users if u.get("email", "").lower() == email.lower()), None)
                    if user:
                        return user
                if username:
                    user = next((u for u in users if u.get("full_name", "").lower() == username.lower()), None)
                    if user:
                        return user
                # If no exact match, return first result
                if users:
                    return users[0]
    except Exception as e:
        pass
    return None


@router.post("/groups", response_model=GroupOut)
async def create_group(
    group: GroupCreate,
    x_user_id: int = Header(..., alias="X-User-Id"),  # User ID from JWT token (set by gateway)
    db: Session = Depends(get_db)
):
    db_group = StudyGroup(
        name=group.name,
        description=group.description,
        owner_id=x_user_id,
        is_public=group.is_public
    )
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    
    # Add owner as first member
    member = GroupMember(group_id=db_group.id, user_id=x_user_id)
    db.add(member)
    db.commit()
    
    # Fetch members and papers
    members = db.query(GroupMember).filter(GroupMember.group_id == db_group.id).all()
    user_infos = []
    for m in members:
        user = await get_user_from_auth_service(m.user_id)
        if user:
            user_infos.append(UserInfo(**user))
    
    papers = db.query(GroupPaper).filter(GroupPaper.group_id == db_group.id).all()
    paper_infos = []
    for p in papers:
        if p.paper_title:
            paper_infos.append(_paper_info_from_group_paper(p, p.paper_title))
        else:
            paper = await get_paper_from_library_service(p.paper_id, owner_user_id=x_user_id)
            if paper:
                paper_infos.append(PaperInfo(
                    id=paper["id"],
                    title=paper["title"],
                    authors=paper["authors"],
                    publication_year=paper["publication_year"],
                    subject=paper["subject"],
                    summary=paper["summary"]
                ))
            else:
                paper_infos.append(_paper_info_from_group_paper(p, f"Paper {p.paper_id}"))
    
    return GroupOut(
        id=db_group.id,
        name=db_group.name,
        description=db_group.description,
        is_public=db_group.is_public,
        owner_id=db_group.owner_id,
        members=user_infos,
        papers=paper_infos,
        created_at=db_group.created_at
    )


@router.get("/groups", response_model=List[GroupOut])
async def get_groups(
    user_id: Optional[int] = None,
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    current_user_id = user_id or x_user_id
    
    if current_user_id:
        # Get user's groups
        member_groups = db.query(GroupMember.group_id).filter(GroupMember.user_id == current_user_id).all()
        group_ids = [g[0] for g in member_groups]
        my_groups = db.query(StudyGroup).filter(StudyGroup.id.in_(group_ids)).all()
        
        # Get public groups user is not in
        public_groups = db.query(StudyGroup).filter(
            StudyGroup.is_public == True,
            ~StudyGroup.id.in_(group_ids)
        ).all()
        
        all_groups = my_groups + public_groups
    else:
        # Get all public groups
        all_groups = db.query(StudyGroup).filter(StudyGroup.is_public == True).all()
    
    result = []
    for group in all_groups:
        is_member = current_user_id is not None and _is_member(db, group.id, current_user_id)
        result.append(await _build_group_out(
            group,
            db,
            current_user_id,
            include_members=True,
            include_papers=is_member,
            redact_member_emails=not is_member,
        ))
    
    return result


@router.get("/groups/{group_id}", response_model=GroupOut)
async def get_group(
    group_id: int,
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    is_member = x_user_id is not None and _is_member(db, group.id, x_user_id)
    if not is_member and not group.is_public:
        raise HTTPException(status_code=404, detail="Group not found")

    return await _build_group_out(
        group,
        db,
        x_user_id,
        include_members=True,
        include_papers=is_member,
        redact_member_emails=not is_member,
    )


@router.post("/groups/{group_id}/join", response_model=GroupOut)
async def join_public_group(
    group_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Join a public group. Private groups require an invitation."""
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not group.is_public:
        raise HTTPException(status_code=403, detail="Private groups require an invitation")

    if not _is_member(db, group_id, x_user_id):
        db.add(GroupMember(group_id=group_id, user_id=x_user_id))
        pending_invitation = db.query(GroupInvitation).filter(
            GroupInvitation.group_id == group_id,
            GroupInvitation.invited_user_id == x_user_id,
            GroupInvitation.status == InvitationStatus.PENDING,
        ).first()
        if pending_invitation:
            pending_invitation.status = InvitationStatus.ACCEPTED
        db.commit()

    return await _build_group_out(
        group,
        db,
        x_user_id,
        include_members=True,
        include_papers=True,
    )


@router.put("/groups/{group_id}", response_model=GroupOut)
async def update_group(
    group_id: int,
    group_update: GroupUpdate,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Update group settings (name, description, is_public) - only owner can update"""
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if group.owner_id != x_user_id:
        raise HTTPException(status_code=403, detail="Only group owner can update group settings")
    
    # Update fields if provided
    if group_update.name is not None:
        group.name = group_update.name
    if group_update.description is not None:
        group.description = group_update.description
    if group_update.is_public is not None:
        group.is_public = group_update.is_public
    
    db.commit()
    db.refresh(group)
    
    # Return updated group
    members = db.query(GroupMember).filter(GroupMember.group_id == group.id).all()
    user_infos = []
    for m in members:
        user = await get_user_from_auth_service(m.user_id)
        if user:
            user_infos.append(UserInfo(**user))
    
    papers = db.query(GroupPaper).filter(GroupPaper.group_id == group.id).all()
    paper_infos = []
    for p in papers:
        if p.paper_title:
            paper_infos.append(_paper_info_from_group_paper(p, p.paper_title))
        else:
            paper = await get_paper_from_library_service(p.paper_id, owner_user_id=x_user_id)
            if paper:
                paper_infos.append(PaperInfo(
                    id=paper["id"],
                    title=paper["title"],
                    authors=paper["authors"],
                    publication_year=paper["publication_year"],
                    subject=paper["subject"],
                    summary=paper["summary"],
                    added_by=p.added_by
                ))
            else:
                paper_infos.append(_paper_info_from_group_paper(p, f"Paper {p.paper_id}"))
    
    return GroupOut(
        id=group.id,
        name=group.name,
        description=group.description,
        is_public=group.is_public,
        owner_id=group.owner_id,
        members=user_infos,
        papers=paper_infos,
        created_at=group.created_at
    )


@router.delete("/groups/{group_id}/leave")
async def leave_group(
    group_id: int,
    new_owner_id: Optional[int] = Query(None, description="New owner ID if transferring ownership"),
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Leave a group. If owner, must transfer ownership or group will be deleted if they're the only member."""
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if user is a member
    is_owner = group.owner_id == x_user_id
    member = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == x_user_id
    ).first()
    
    if not member and not is_owner:
        raise HTTPException(status_code=400, detail="You are not a member of this group")
    
    # Handle owner leaving
    if is_owner:
        # Get all members (excluding the owner)
        other_members = db.query(GroupMember).filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id != x_user_id
        ).all()
        
        if len(other_members) > 0:
            # Owner must transfer ownership to another member
            if not new_owner_id:
                raise HTTPException(
                    status_code=400, 
                    detail="You must transfer ownership to another member before leaving. Please select a new owner."
                )
            
            # Verify the new owner is actually a member
            new_owner_member = db.query(GroupMember).filter(
                GroupMember.group_id == group_id,
                GroupMember.user_id == new_owner_id
            ).first()
            
            if not new_owner_member:
                raise HTTPException(
                    status_code=400,
                    detail="The selected user is not a member of this group"
                )
            
            # Transfer ownership
            group.owner_id = new_owner_id
            _remove_user_group_data(db, group_id, x_user_id)
            db.commit()
            
            # Remove the old owner from members (if they were a member)
            if member:
                db.delete(member)
                db.commit()
            
            return {
                "status": "success",
                "message": "Ownership transferred and you have left the group",
                "new_owner_id": new_owner_id
            }
        else:
            # Owner is the only member - delete the group
            # This will cascade delete members, papers, highlights, comments, invitations
            db.delete(group)
            db.commit()
            return {
                "status": "success",
                "message": "Group deleted as you were the only member",
                "group_deleted": True
            }
    else:
        # Regular member leaving
        _remove_user_group_data(db, group_id, x_user_id)
        db.delete(member)
        db.commit()
        return {"status": "success", "message": "Successfully left the group"}


@router.post("/groups/{group_id}/invitations", response_model=InvitationOut)
async def invite_user(
    group_id: int,
    invitation: InvitationCreate,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Allow owner or members to invite (not just owner)
    is_owner = group.owner_id == x_user_id
    is_member = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == x_user_id
    ).first() is not None
    
    if not is_owner and not is_member:
        raise HTTPException(status_code=403, detail="You must be a member of the group to invite others")
    
    # Determine invited_user_id from invitation data
    invited_user_id = invitation.invited_user_id
    
    if not invited_user_id:
        # Try to find user by email or username
        if invitation.email or invitation.username:
            user_data = await search_user_by_email_or_username(
                email=invitation.email,
                username=invitation.username
            )
            if not user_data:
                raise HTTPException(status_code=404, detail="User not found. Please check the email or username.")
            invited_user_id = user_data.get("id")
        else:
            raise HTTPException(status_code=400, detail="Must provide either invited_user_id, email, or username")
    
    # Check if user is already a member
    existing_member = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == invited_user_id
    ).first()
    if existing_member:
        raise HTTPException(status_code=400, detail="User is already a member")
    
    # Check for pending invitation
    existing_inv = db.query(GroupInvitation).filter(
        GroupInvitation.group_id == group_id,
        GroupInvitation.invited_user_id == invited_user_id,
        GroupInvitation.status == InvitationStatus.PENDING
    ).first()
    if existing_inv:
        raise HTTPException(status_code=400, detail="User has already been invited")
    
    db_invitation = GroupInvitation(
        group_id=group_id,
        inviter_id=x_user_id,
        invited_user_id=invited_user_id,
        status=InvitationStatus.PENDING
    )
    db.add(db_invitation)
    db.commit()
    db.refresh(db_invitation)
    
    return InvitationOut(
        id=db_invitation.id,
        group_id=db_invitation.group_id,
        inviter_id=db_invitation.inviter_id,
        invited_user_id=db_invitation.invited_user_id,
        status=db_invitation.status.value,
        created_at=db_invitation.created_at,
        group_name=group.name
    )


@router.get("/invitations", response_model=List[InvitationOut])
async def get_user_invitations(
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    invitations = db.query(GroupInvitation).filter(
        GroupInvitation.invited_user_id == x_user_id,
        GroupInvitation.status == InvitationStatus.PENDING
    ).all()
    
    result = []
    for inv in invitations:
        group = db.query(StudyGroup).filter(StudyGroup.id == inv.group_id).first()
        # Fetch inviter info
        inviter = await get_user_from_auth_service(inv.inviter_id)
        result.append(InvitationOut(
            id=inv.id,
            group_id=inv.group_id,
            inviter_id=inv.inviter_id,
            inviter_name=inviter.get("name") if inviter else None,
            inviter_email=inviter.get("email") if inviter else None,
            invited_user_id=inv.invited_user_id,
            status=inv.status.value,
            created_at=inv.created_at,
            group_name=group.name if group else None
        ))
    
    return result


@router.post("/invitations/{invitation_id}/respond")
async def respond_to_invitation(
    invitation_id: int,
    response_data: InvitationResponse,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    response = response_data.response
    invitation = db.query(GroupInvitation).filter(
        GroupInvitation.id == invitation_id,
        GroupInvitation.invited_user_id == x_user_id
    ).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    if response == "accepted":
        invitation.status = InvitationStatus.ACCEPTED
        # Add user to group
        existing_member = db.query(GroupMember).filter(
            GroupMember.group_id == invitation.group_id,
            GroupMember.user_id == x_user_id
        ).first()
        if not existing_member:
            member = GroupMember(group_id=invitation.group_id, user_id=x_user_id)
            db.add(member)
    elif response == "declined":
        invitation.status = InvitationStatus.DECLINED
    else:
        raise HTTPException(status_code=400, detail="Response must be 'accepted' or 'declined'")
    
    db.commit()
    return {"status": "success"}


# --- Group Document Management ---

class AddPaperRequest(BaseModel):
    paper_id: int


@router.post("/groups/{group_id}/papers")
async def add_paper_to_group(
    group_id: int,
    request: AddPaperRequest,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Add a paper to a group. Each user can add up to 10 papers."""
    paper_id = request.paper_id
    # Verify group exists and user is a member
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if user is a member
    is_member = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == x_user_id
    ).first() or group.owner_id == x_user_id
    
    if not is_member:
        raise HTTPException(status_code=403, detail="You must be a member of the group to add papers")
    
    # Check if paper already exists in group
    existing = db.query(GroupPaper).filter(
        GroupPaper.group_id == group_id,
        GroupPaper.paper_id == paper_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Paper is already in this group")
    
    # Check user's paper limit (10 papers per user per group)
    user_papers_count = db.query(GroupPaper).filter(
        GroupPaper.group_id == group_id,
        GroupPaper.added_by == x_user_id
    ).count()
    
    if user_papers_count >= 10:
        raise HTTPException(status_code=400, detail="You have reached the limit of 10 papers per group")
    
    # Verify paper exists in the adder's library (per-user library: only owner can add their paper)
    paper = await get_paper_from_library_service(paper_id, owner_user_id=x_user_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found in your library")
    paper_title = paper.get("title") or f"Paper {paper_id}"
    # Add paper to group (store title so we don't need to fetch from library for display)
    group_paper = GroupPaper(
        group_id=group_id,
        paper_id=paper_id,
        paper_title=paper_title,
        added_by=x_user_id
    )
    db.add(group_paper)
    db.commit()
    db.refresh(group_paper)
    
    return {
        "id": group_paper.id,
        "group_id": group_paper.group_id,
        "paper_id": group_paper.paper_id,
        "added_by": group_paper.added_by,
        "added_at": group_paper.added_at
    }


@router.delete("/groups/{group_id}/papers/{paper_id}")
async def remove_paper_from_group(
    group_id: int,
    paper_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Remove a paper from a group. Only the user who added it can remove it."""
    group_paper = db.query(GroupPaper).filter(
        GroupPaper.group_id == group_id,
        GroupPaper.paper_id == paper_id,
        GroupPaper.added_by == x_user_id
    ).first()
    
    if not group_paper:
        raise HTTPException(status_code=404, detail="Paper not found in group or you don't have permission to remove it")
    
    db.delete(group_paper)
    db.commit()
    return {"status": "success", "message": "Paper removed from group"}


@router.get("/groups/{group_id}/papers/{paper_id}")
async def get_group_paper(
    group_id: int,
    paper_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Return a shared paper only to joined group members."""
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _assert_member(db, group, x_user_id)

    group_paper = db.query(GroupPaper).filter(
        GroupPaper.group_id == group_id,
        GroupPaper.paper_id == paper_id
    ).first()
    if not group_paper:
        raise HTTPException(status_code=404, detail="Paper is not in this group")

    paper = await get_paper_from_library_service(paper_id, owner_user_id=group_paper.added_by)
    if not paper:
        raise HTTPException(status_code=404, detail="Shared paper is no longer available")
    return paper


# --- Shared Highlights for Group Documents ---

@router.post("/groups/{group_id}/highlights", response_model=GroupHighlightOut)
async def create_group_highlight(
    group_id: int,
    highlight: GroupHighlightCreate,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Create a shared highlight in a group document."""
    # Verify group exists and user is a member
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    is_member = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == x_user_id
    ).first() or group.owner_id == x_user_id
    
    if not is_member:
        raise HTTPException(status_code=403, detail="You must be a member of the group")
    
    # Verify paper is in the group
    group_paper = db.query(GroupPaper).filter(
        GroupPaper.group_id == group_id,
        GroupPaper.paper_id == highlight.paper_id
    ).first()
    if not group_paper:
        raise HTTPException(status_code=404, detail="Paper is not in this group")
    
    # Validate color
    valid_colors = ["yellow", "green", "blue", "pink", "orange", "purple", "teal", "red", "cyan", "lime"]
    if highlight.color not in valid_colors:
        raise HTTPException(status_code=400, detail=f"Invalid color. Must be one of: {', '.join(valid_colors)}")
    
    db_highlight = GroupHighlight(
        group_id=group_id,
        paper_id=highlight.paper_id,
        user_id=x_user_id,
        color=highlight.color,
        highlighted_text=highlight.highlighted_text,
        start_offset=highlight.start_offset,
        end_offset=highlight.end_offset,
        context_before=highlight.context_before,
        context_after=highlight.context_after
    )
    db.add(db_highlight)
    db.commit()
    db.refresh(db_highlight)
    
    # Get user info for response
    user_info = await get_user_from_auth_service(x_user_id)
    
    return GroupHighlightOut(
        id=db_highlight.id,
        group_id=db_highlight.group_id,
        paper_id=db_highlight.paper_id,
        user_id=db_highlight.user_id,
        user_name=user_info.get("name") if user_info else None,
        color=db_highlight.color,
        highlighted_text=db_highlight.highlighted_text,
        start_offset=db_highlight.start_offset,
        end_offset=db_highlight.end_offset,
        context_before=db_highlight.context_before,
        context_after=db_highlight.context_after,
        created_at=db_highlight.created_at
    )


@router.get("/groups/{group_id}/papers/{paper_id}/highlights", response_model=List[GroupHighlightOut])
async def get_group_paper_highlights(
    group_id: int,
    paper_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Get all shared highlights for a paper in a group."""
    # Verify group exists and user is a member
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    is_member = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == x_user_id
    ).first() or group.owner_id == x_user_id
    
    if not is_member:
        raise HTTPException(status_code=403, detail="You must be a member of the group")
    
    highlights = db.query(GroupHighlight).filter(
        GroupHighlight.group_id == group_id,
        GroupHighlight.paper_id == paper_id
    ).order_by(GroupHighlight.created_at.desc()).all()
    
    result = []
    for h in highlights:
        user_info = await get_user_from_auth_service(h.user_id)
        result.append(GroupHighlightOut(
            id=h.id,
            group_id=h.group_id,
            paper_id=h.paper_id,
            user_id=h.user_id,
            user_name=user_info.get("name") if user_info else None,
            color=h.color,
            highlighted_text=h.highlighted_text,
            start_offset=h.start_offset,
            end_offset=h.end_offset,
            context_before=h.context_before,
            context_after=h.context_after,
            created_at=h.created_at
        ))
    
    return result


@router.delete("/groups/{group_id}/highlights/{highlight_id}")
async def delete_group_highlight(
    group_id: int,
    highlight_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Delete a shared highlight. Only the creator can delete it."""
    highlight = db.query(GroupHighlight).filter(
        GroupHighlight.id == highlight_id,
        GroupHighlight.group_id == group_id,
        GroupHighlight.user_id == x_user_id
    ).first()
    
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found or you don't have permission to delete it")
    
    db.delete(highlight)
    db.commit()
    return {"status": "success", "message": "Highlight deleted"}


# --- Shared Comments for Group Documents ---

@router.post("/groups/{group_id}/comments", response_model=GroupCommentOut)
async def create_group_comment(
    group_id: int,
    comment: GroupCommentCreate,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Create a shared comment on text in a group document."""
    # Verify group exists and user is a member
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    is_member = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == x_user_id
    ).first() or group.owner_id == x_user_id
    
    if not is_member:
        raise HTTPException(status_code=403, detail="You must be a member of the group")
    
    # Verify paper is in the group
    group_paper = db.query(GroupPaper).filter(
        GroupPaper.group_id == group_id,
        GroupPaper.paper_id == comment.paper_id
    ).first()
    if not group_paper:
        raise HTTPException(status_code=404, detail="Paper is not in this group")
    
    db_comment = GroupComment(
        group_id=group_id,
        paper_id=comment.paper_id,
        user_id=x_user_id,
        commented_text=comment.commented_text,
        comment_text=comment.comment_text,
        start_offset=comment.start_offset,
        end_offset=comment.end_offset,
        context_before=comment.context_before,
        context_after=comment.context_after
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    
    # Get user info for response
    user_info = await get_user_from_auth_service(x_user_id)
    
    return GroupCommentOut(
        id=db_comment.id,
        group_id=db_comment.group_id,
        paper_id=db_comment.paper_id,
        user_id=db_comment.user_id,
        user_name=user_info.get("name") if user_info else None,
        commented_text=db_comment.commented_text,
        comment_text=db_comment.comment_text,
        start_offset=db_comment.start_offset,
        end_offset=db_comment.end_offset,
        context_before=db_comment.context_before,
        context_after=db_comment.context_after,
        created_at=db_comment.created_at,
        updated_at=db_comment.updated_at
    )


@router.get("/groups/{group_id}/papers/{paper_id}/comments", response_model=List[GroupCommentOut])
async def get_group_paper_comments(
    group_id: int,
    paper_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Get all shared comments for a paper in a group."""
    # Verify group exists and user is a member
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    is_member = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == x_user_id
    ).first() or group.owner_id == x_user_id
    
    if not is_member:
        raise HTTPException(status_code=403, detail="You must be a member of the group")
    
    comments = db.query(GroupComment).filter(
        GroupComment.group_id == group_id,
        GroupComment.paper_id == paper_id
    ).order_by(GroupComment.created_at.asc()).all()
    
    result = []
    for c in comments:
        user_info = await get_user_from_auth_service(c.user_id)
        result.append(GroupCommentOut(
            id=c.id,
            group_id=c.group_id,
            paper_id=c.paper_id,
            user_id=c.user_id,
            user_name=user_info.get("name") if user_info else None,
            commented_text=c.commented_text,
            comment_text=c.comment_text,
            start_offset=c.start_offset,
            end_offset=c.end_offset,
            context_before=c.context_before,
            context_after=c.context_after,
            created_at=c.created_at,
            updated_at=c.updated_at
        ))
    
    return result


@router.put("/groups/{group_id}/comments/{comment_id}", response_model=GroupCommentOut)
async def update_group_comment(
    group_id: int,
    comment_id: int,
    comment_update: GroupCommentUpdate,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Update a shared comment. Only the creator can update it."""
    comment = db.query(GroupComment).filter(
        GroupComment.id == comment_id,
        GroupComment.group_id == group_id,
        GroupComment.user_id == x_user_id
    ).first()
    
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found or you don't have permission to update it")
    
    comment.comment_text = comment_update.comment_text
    db.commit()
    db.refresh(comment)
    
    user_info = await get_user_from_auth_service(x_user_id)
    
    return GroupCommentOut(
        id=comment.id,
        group_id=comment.group_id,
        paper_id=comment.paper_id,
        user_id=comment.user_id,
        user_name=user_info.get("name") if user_info else None,
        commented_text=comment.commented_text,
        comment_text=comment.comment_text,
        start_offset=comment.start_offset,
        end_offset=comment.end_offset,
        context_before=comment.context_before,
        context_after=comment.context_after,
        created_at=comment.created_at,
        updated_at=comment.updated_at
    )


@router.delete("/groups/{group_id}/comments/{comment_id}")
async def delete_group_comment(
    group_id: int,
    comment_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Delete a shared comment. Only the creator can delete it."""
    comment = db.query(GroupComment).filter(
        GroupComment.id == comment_id,
        GroupComment.group_id == group_id,
        GroupComment.user_id == x_user_id
    ).first()

    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found or you don't have permission to delete it")

    db.delete(comment)
    db.commit()
    return {"status": "success", "message": "Comment deleted"}


@router.get("/groups/{group_id}/papers/{paper_id}/notes-summary", response_model=PaperNotesSummaryOut)
async def get_paper_notes_summary(
    group_id: int,
    paper_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Return the cached paper notes summary; create it if missing."""
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _assert_member(db, group, x_user_id)

    if not db.query(GroupPaper).filter(GroupPaper.group_id == group_id, GroupPaper.paper_id == paper_id).first():
        raise HTTPException(status_code=404, detail="Paper not found in this group")

    row = db.query(GroupPaperNotesSummary).filter(
        GroupPaperNotesSummary.group_id == group_id,
        GroupPaperNotesSummary.paper_id == paper_id,
    ).first()
    if row:
        return _paper_summary_out(row)
    return await _regenerate_paper_notes_summary(db, group_id, paper_id)


@router.post("/groups/{group_id}/papers/{paper_id}/notes-summary", response_model=PaperNotesSummaryOut)
async def regenerate_paper_notes_summary(
    group_id: int,
    paper_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Regenerate and persist the paper notes summary."""
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _assert_member(db, group, x_user_id)

    if not db.query(GroupPaper).filter(GroupPaper.group_id == group_id, GroupPaper.paper_id == paper_id).first():
        raise HTTPException(status_code=404, detail="Paper not found in this group")
    return await _regenerate_paper_notes_summary(db, group_id, paper_id)


@router.get("/groups/{group_id}/notes-summary", response_model=GroupNotesSummaryOut)
async def get_group_notes_summary(
    group_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Return the cached group notes summary; create it if missing."""
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _assert_member(db, group, x_user_id)

    _, _, paper_blocks, _, _, _ = await _collect_group_notes_data(db, group)
    row = db.query(GroupNotesSummary).filter(GroupNotesSummary.group_id == group_id).first()
    if row:
        return _group_summary_out(row, paper_blocks)
    return await _regenerate_group_notes_summary(db, group)


@router.post("/groups/{group_id}/notes-summary", response_model=GroupNotesSummaryOut)
async def regenerate_group_notes_summary(
    group_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Regenerate and persist the group notes summary."""
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _assert_member(db, group, x_user_id)
    return await _regenerate_group_notes_summary(db, group)


@router.post("/groups/{group_id}/notes-summary/regenerate-all", response_model=GroupNotesSummaryOut)
async def regenerate_all_group_notes_summaries(
    group_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    """Regenerate all paper summaries in a group, then regenerate the group summary."""
    group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _assert_member(db, group, x_user_id)

    group_papers = db.query(GroupPaper).filter(GroupPaper.group_id == group_id).all()
    for group_paper in group_papers:
        await _regenerate_paper_notes_summary(db, group_id, group_paper.paper_id)
    return await _regenerate_group_notes_summary(db, group)
