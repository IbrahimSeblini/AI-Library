import asyncio
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

import httpx

from ..database import get_db
from ..deps import get_current_user_id
from ..models import Friendship, ReadingActivity
from ..schemas import (
    ActivityCreate,
    ActivityOut,
    FeedItem,
    InsightsOut,
    TrendingPaper,
    ActiveReader,
    TrendingSubjectOut,
    ActiveReaderByTime,
)
from ..core.config import settings

router = APIRouter(prefix="/activity", tags=["activity"])


def _mutual_friend_ids(db: Session, current_user_id: int) -> List[int]:
    """Return list of user IDs that are mutual friends with current_user_id."""
    my_following = (
        db.query(Friendship)
        .filter(Friendship.follower_id == current_user_id)
        .all()
    )
    return [
        f.following_id
        for f in my_following
        if db.query(Friendship).filter(
            Friendship.follower_id == f.following_id,
            Friendship.following_id == current_user_id,
        ).first()
    ]


def _fmt(secs: float) -> str:
    if secs < 60:
        return f"{int(secs)}s"
    mins = int(secs // 60)
    hours = mins // 60
    remaining_mins = mins % 60
    if hours > 0:
        return f"{hours}h {remaining_mins}m"
    return f"{remaining_mins}m"


async def _get_user_display(user_id: int) -> str:
    """Fetch display name from auth service for a user (e.g. for insights)."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.AUTH_SERVICE_URL}/auth/users/{user_id}")
            if resp.status_code == 200:
                data = resp.json()
                name = data.get("full_name") or (data.get("email", "") or "").split("@")[0]
                if name:
                    return name
    except Exception:
        pass
    return f"User #{user_id}"


@router.post("/", response_model=ActivityOut, status_code=201)
def log_activity(
    body: ActivityCreate,
    user_name: str = Query("", description="Display name of the user"),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Log a reading event (opened, finished, highlighted)."""
    valid_actions = {"opened", "finished", "highlighted"}
    if body.action not in valid_actions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action. Must be one of: {', '.join(valid_actions)}",
        )

    activity = ReadingActivity(
        user_id=current_user_id,
        user_name=user_name,
        paper_id=body.paper_id,
        paper_title=body.paper_title,
        action=body.action,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)

    return ActivityOut(
        id=activity.id,
        user_id=activity.user_id,
        user_name=activity.user_name,
        paper_id=activity.paper_id,
        paper_title=activity.paper_title,
        action=activity.action,
        created_at=activity.created_at,
    )


@router.get("/feed", response_model=List[FeedItem])
def get_friends_feed(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Return a chronological feed of reading activity from mutual friends only."""
    friend_ids = _mutual_friend_ids(db, current_user_id)
    if not friend_ids:
        return []

    activities = (
        db.query(ReadingActivity)
        .filter(ReadingActivity.user_id.in_(friend_ids))
        .order_by(ReadingActivity.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [
        FeedItem(
            id=a.id,
            user_id=a.user_id,
            user_name=a.user_name,
            paper_id=a.paper_id,
            paper_title=a.paper_title,
            action=a.action,
            created_at=a.created_at,
        )
        for a in activities
    ]


@router.get("/my", response_model=List[ActivityOut])
def get_my_activity(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Return the current user's own reading history."""
    activities = (
        db.query(ReadingActivity)
        .filter(ReadingActivity.user_id == current_user_id)
        .order_by(ReadingActivity.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [
        ActivityOut(
            id=a.id,
            user_id=a.user_id,
            user_name=a.user_name,
            paper_id=a.paper_id,
            paper_title=a.paper_title,
            action=a.action,
            created_at=a.created_at,
        )
        for a in activities
    ]


@router.get("/insights", response_model=InsightsOut)
async def get_insights(
    request: Request,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Insights from mutual friends: trending papers, trending subjects (from tracker), most active by actions and by reading time (top 5)."""
    friend_ids = _mutual_friend_ids(db, current_user_id)

    # Subquery for mutual friends only
    if not friend_ids:
        return InsightsOut(
            trending_papers=[],
            trending_subjects=[],
            most_active_readers=[],
            most_active_readers_by_time=[],
        )

    # Trending papers among friends (reading activity)
    trending_rows = (
        db.query(
            ReadingActivity.paper_id,
            ReadingActivity.paper_title,
            func.count(ReadingActivity.id).label("cnt"),
        )
        .filter(ReadingActivity.user_id.in_(friend_ids))
        .group_by(ReadingActivity.paper_id, ReadingActivity.paper_title)
        .order_by(func.count(ReadingActivity.id).desc())
        .limit(10)
        .all()
    )
    trending_papers = [
        TrendingPaper(paper_id=row[0], title=row[1], read_count=row[2])
        for row in trending_rows
    ]

    # Most active readers by action count
    active_rows = (
        db.query(
            ReadingActivity.user_id,
            ReadingActivity.user_name,
            func.count(ReadingActivity.id).label("cnt"),
        )
        .filter(ReadingActivity.user_id.in_(friend_ids))
        .group_by(ReadingActivity.user_id, ReadingActivity.user_name)
        .order_by(func.count(ReadingActivity.id).desc())
        .limit(10)
        .all()
    )
    most_active = [
        ActiveReader(user_id=row[0], name=row[1], count=row[2])
        for row in active_rows
    ]

    # Fetch reading time from study tracker for trending subjects + top 5 by time
    trending_subjects: List[TrendingSubjectOut] = []
    most_active_by_time: List[ActiveReaderByTime] = []
    name_by_id = {r.user_id: r.name for r in most_active}
    # Resolve names for any friend not in reading activity (e.g. they only have tracker time)
    missing_ids = [uid for uid in friend_ids if uid not in name_by_id]
    if missing_ids:
        names = await asyncio.gather(*[_get_user_display(uid) for uid in missing_ids])
        for uid, name in zip(missing_ids, names):
            name_by_id[uid] = name

    auth_header = request.headers.get("Authorization")
    if auth_header and getattr(settings, "TRACKER_SERVICE_URL", None):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{settings.TRACKER_SERVICE_URL}/tracker/reading-stats-bulk",
                    json={"user_ids": friend_ids},
                    headers={"Authorization": auth_header, "Content-Type": "application/json"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    users_data = data.get("users", [])
                    subject_seconds: dict[str, float] = defaultdict(float)
                    for u in users_data:
                        for c in u.get("by_category", []):
                            subject_seconds[c["category"]] += c.get("total_seconds", 0)
                        most_active_by_time.append(
                            ActiveReaderByTime(
                                user_id=u["user_id"],
                                name=name_by_id.get(u["user_id"], f"User #{u['user_id']}"),
                                total_seconds=u.get("total_seconds", 0),
                                formatted=u.get("formatted", _fmt(u.get("total_seconds", 0))),
                            )
                        )
                    most_active_by_time.sort(key=lambda x: x.total_seconds, reverse=True)
                    most_active_by_time = most_active_by_time[:5]
                    trending_subjects = [
                        TrendingSubjectOut(subject=s, count=1, total_seconds=secs)
                        for s, secs in sorted(subject_seconds.items(), key=lambda x: -x[1])[:10]
                    ]
        except Exception:
            pass

    return InsightsOut(
        trending_papers=trending_papers,
        trending_subjects=trending_subjects,
        most_active_readers=most_active,
        most_active_readers_by_time=most_active_by_time,
    )
