from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone

import httpx

from ..database import get_db
from ..deps import get_current_user_id
from ..models import Friendship, FriendRequest
from ..schemas import FollowRequest, FriendOut, FriendRequestOut
from ..core.config import settings

router = APIRouter(prefix="/friends", tags=["friends"])


async def _get_user_display(user_id: int) -> tuple[str, str]:
    """Fetch name and email from auth service. Returns (name, email)."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.AUTH_SERVICE_URL}/auth/users/{user_id}")
            if resp.status_code == 200:
                data = resp.json()
                name = data.get("full_name") or (data.get("email", "") or "").split("@")[0] or f"User #{user_id}"
                email = data.get("email", "")
                return (name, email)
    except Exception:
        pass
    return (f"User #{user_id}", "")


def _are_mutual_friends(db: Session, user_id: int, other_id: int) -> bool:
    """Check if both (user_id -> other_id) and (other_id -> user_id) exist."""
    forward = db.query(Friendship).filter(
        Friendship.follower_id == user_id,
        Friendship.following_id == other_id,
    ).first()
    if not forward:
        return False
    return db.query(Friendship).filter(
        Friendship.follower_id == other_id,
        Friendship.following_id == user_id,
    ).first() is not None


# ─── Connect (send request) ───────────────────────────────────────────────────

@router.post("/request", status_code=201)
async def send_connection_request(
    body: FollowRequest,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Send a connection request to another user. They must accept to become friends."""
    if body.target_user_id == current_user_id:
        raise HTTPException(status_code=400, detail="You cannot connect with yourself")

    # Already friends?
    if _are_mutual_friends(db, current_user_id, body.target_user_id):
        raise HTTPException(status_code=409, detail="Already friends with this user")

    # Existing request in either direction?
    existing = (
        db.query(FriendRequest)
        .filter(
            (
                (FriendRequest.from_user_id == current_user_id) & (FriendRequest.to_user_id == body.target_user_id)
            ) | (
                (FriendRequest.from_user_id == body.target_user_id) & (FriendRequest.to_user_id == current_user_id)
            ),
            FriendRequest.status == "pending",
        )
        .first()
    )
    if existing:
        if existing.from_user_id == current_user_id:
            raise HTTPException(status_code=409, detail="Connection request already sent")
        raise HTTPException(status_code=409, detail="This user has already sent you a request. Check incoming requests.")

    req = FriendRequest(
        from_user_id=current_user_id,
        to_user_id=body.target_user_id,
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"status": "success", "message": "Connection request sent", "request_id": req.id}


# ─── Accept / Reject ─────────────────────────────────────────────────────────

@router.get("/requests/incoming", response_model=List[FriendRequestOut])
async def list_incoming_requests(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List pending connection requests sent to the current user (so they can accept/reject)."""
    rows = (
        db.query(FriendRequest)
        .filter(FriendRequest.to_user_id == current_user_id, FriendRequest.status == "pending")
        .order_by(FriendRequest.created_at.desc())
        .all()
    )
    result: List[FriendRequestOut] = []
    for r in rows:
        name, email = await _get_user_display(r.from_user_id)
        result.append(
            FriendRequestOut(
                id=r.id,
                from_user_id=r.from_user_id,
                to_user_id=r.to_user_id,
                from_user_name=name,
                from_user_email=email,
                status=r.status,
                created_at=r.created_at,
                responded_at=r.responded_at,
            )
        )
    return result


@router.get("/requests/sent", response_model=List[FriendRequestOut])
async def list_sent_requests(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List connection requests the current user has sent (pending)."""
    rows = (
        db.query(FriendRequest)
        .filter(FriendRequest.from_user_id == current_user_id, FriendRequest.status == "pending")
        .order_by(FriendRequest.created_at.desc())
        .all()
    )
    result: List[FriendRequestOut] = []
    for r in rows:
        name, email = await _get_user_display(r.to_user_id)
        result.append(
            FriendRequestOut(
                id=r.id,
                from_user_id=r.from_user_id,
                to_user_id=r.to_user_id,
                from_user_name=name,
                from_user_email=email,
                status=r.status,
                created_at=r.created_at,
                responded_at=r.responded_at,
            )
        )
    return result


@router.post("/requests/{request_id}/accept", status_code=200)
async def accept_request(
    request_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Accept a connection request. Creates mutual friendship."""
    req = db.query(FriendRequest).filter(FriendRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.to_user_id != current_user_id:
        raise HTTPException(status_code=403, detail="You can only accept requests sent to you")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request already responded to")

    now = datetime.now(timezone.utc)
    req.status = "accepted"
    req.responded_at = now
    # Create both directions if not already present (e.g. from legacy one-way follow)
    for a, b in [(current_user_id, req.from_user_id), (req.from_user_id, current_user_id)]:
        if not db.query(Friendship).filter(Friendship.follower_id == a, Friendship.following_id == b).first():
            db.add(Friendship(follower_id=a, following_id=b))
    db.commit()
    return {"status": "success", "message": "You are now friends"}


@router.post("/requests/{request_id}/reject", status_code=200)
async def reject_request(
    request_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Reject a connection request."""
    req = db.query(FriendRequest).filter(FriendRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.to_user_id != current_user_id:
        raise HTTPException(status_code=403, detail="You can only reject requests sent to you")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request already responded to")

    req.status = "rejected"
    req.responded_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "success", "message": "Request rejected"}


@router.delete("/requests/{request_id}", status_code=200)
async def cancel_sent_request(
    request_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Cancel a connection request you sent (only pending)."""
    req = db.query(FriendRequest).filter(FriendRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.from_user_id != current_user_id:
        raise HTTPException(status_code=403, detail="You can only cancel your own requests")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request already responded to")
    db.delete(req)
    db.commit()
    return {"status": "success", "message": "Request cancelled"}


# ─── List friends (mutual only) ──────────────────────────────────────────────

@router.get("/", response_model=List[FriendOut])
async def list_friends(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Return only mutual friends (users who have accepted connection with you)."""
    my_following = (
        db.query(Friendship)
        .filter(Friendship.follower_id == current_user_id)
        .order_by(Friendship.created_at.desc())
        .all()
    )
    result: List[FriendOut] = []
    for f in my_following:
        other_id = f.following_id
        reverse = db.query(Friendship).filter(
            Friendship.follower_id == other_id,
            Friendship.following_id == current_user_id,
        ).first()
        if not reverse:
            continue
        name, email = await _get_user_display(other_id)
        result.append(
            FriendOut(
                id=f.id,
                friend_id=other_id,
                friend_name=name,
                friend_email=email,
                since=f.created_at,
            )
        )
    return result


# ─── Disconnect (remove mutual friendship) ───────────────────────────────────

@router.delete("/disconnect/{target_user_id}", status_code=200)
def disconnect_user(
    target_user_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Remove friendship (both directions)."""
    f1 = db.query(Friendship).filter(
        Friendship.follower_id == current_user_id,
        Friendship.following_id == target_user_id,
    ).first()
    f2 = db.query(Friendship).filter(
        Friendship.follower_id == target_user_id,
        Friendship.following_id == current_user_id,
    ).first()
    if not f1 or not f2:
        raise HTTPException(status_code=404, detail="Not friends with this user")
    db.delete(f1)
    db.delete(f2)
    db.commit()
    return {"status": "success", "message": "Disconnected"}


# Legacy alias for frontend that might still call unfollow
@router.delete("/unfollow/{target_user_id}", status_code=200)
def unfollow_user(
    target_user_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Unfollow/disconnect: remove both directions if mutual, else just remove own follow."""
    f1 = db.query(Friendship).filter(
        Friendship.follower_id == current_user_id,
        Friendship.following_id == target_user_id,
    ).first()
    f2 = db.query(Friendship).filter(
        Friendship.follower_id == target_user_id,
        Friendship.following_id == current_user_id,
    ).first()
    if not f1:
        raise HTTPException(status_code=404, detail="You are not following this user")
    db.delete(f1)
    if f2:
        db.delete(f2)
    db.commit()
    return {"status": "success", "message": "Unfollowed user"}


@router.get("/followers/count")
def get_follower_count(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Return friends count (mutual) and pending incoming count."""
    my_following = db.query(Friendship).filter(Friendship.follower_id == current_user_id).all()
    friends_count = sum(
        1 for f in my_following
        if db.query(Friendship).filter(
            Friendship.follower_id == f.following_id,
            Friendship.following_id == current_user_id,
        ).first()
    )
    pending_incoming = db.query(FriendRequest).filter(
        FriendRequest.to_user_id == current_user_id,
        FriendRequest.status == "pending",
    ).count()
    pending_sent = db.query(FriendRequest).filter(
        FriendRequest.from_user_id == current_user_id,
        FriendRequest.status == "pending",
    ).count()
    return {
        "friends": friends_count,
        "pending_incoming": pending_incoming,
        "pending_sent": pending_sent,
    }


@router.get("/check/{target_user_id}")
def check_following(
    target_user_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Check if the current user is friends with this user (mutual)."""
    is_friend = _are_mutual_friends(db, current_user_id, target_user_id)
    return {"is_following": is_friend, "is_friend": is_friend}
