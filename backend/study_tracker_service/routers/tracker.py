import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date

from ..core.config import settings
from ..database import get_db
from ..deps import get_current_user_id
from ..models import StudySession
from ..schemas import (
    SessionStart,
    SessionOut,
    WeeklySummary,
    ActivityBreakdown,
    CategoryBreakdown,
    DailyPoint,
    ReadingStatsBulkRequest,
    ReadingStatsBulkResponse,
    UserReadingStats,
    UserCategorySeconds,
    ReadingSpeed,
)

router = APIRouter(prefix="/tracker", tags=["study-tracker"])

VALID_ACTIVITIES = {"reading", "chatbot", "groups", "plagiarism", "home"}
DEFAULT_READING_WPM = float(os.getenv("DEFAULT_READING_WPM", "220"))
# Max believable session length — anything longer is a zombie session (browser crashed / server restarted)
MAX_SESSION_SECS = 4 * 3600  # 4 hours


def _fmt(secs: float) -> str:
    """Format seconds into human-readable string like '2h 15m'."""
    if secs < 60:
        return f"{int(secs)}s"
    mins = int(secs // 60)
    hours = mins // 60
    remaining_mins = mins % 60
    if hours > 0:
        return f"{hours}h {remaining_mins}m"
    return f"{remaining_mins}m"


def _monday_of(dt: datetime) -> datetime:
    """Return the Monday 00:00 of the week containing dt."""
    return (dt - timedelta(days=dt.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


@router.get("/reading-speed", response_model=ReadingSpeed)
async def get_reading_speed(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user_id,
            StudySession.activity_type == "reading",
            StudySession.paper_id.isnot(None),
            StudySession.duration_secs.isnot(None),
        )
        .all()
    )

    sample_size = len(sessions)
    total_minutes = sum((s.duration_secs or 0.0) for s in sessions) / 60.0
    if sample_size < 3 or total_minutes < 5:
        return ReadingSpeed(
            words_per_minute=DEFAULT_READING_WPM,
            sample_size=sample_size,
            default_used=True,
        )

    word_counts: dict[str, int] = {}
    async with httpx.AsyncClient(timeout=5.0) as client:
        for session in sessions:
            paper_id = str(session.paper_id)
            if paper_id in word_counts:
                continue
            try:
                resp = await client.get(
                    f"{settings.LIBRARY_SERVICE_URL}/api/v1/papers/{paper_id}/word-count",
                    headers={"X-User-Id": str(current_user_id)},
                )
                resp.raise_for_status()
                payload = resp.json() or {}
                word_count = int(payload.get("word_count", 0))
                if word_count <= 0:
                    raise ValueError("word_count missing or invalid")
                word_counts[paper_id] = word_count
            except Exception:
                return ReadingSpeed(
                    words_per_minute=DEFAULT_READING_WPM,
                    sample_size=sample_size,
                    default_used=True,
                )

    total_words = sum(word_counts[str(session.paper_id)] for session in sessions if str(session.paper_id) in word_counts)
    if total_words <= 0 or total_minutes <= 0:
        return ReadingSpeed(
            words_per_minute=DEFAULT_READING_WPM,
            sample_size=sample_size,
            default_used=True,
        )

    return ReadingSpeed(
        words_per_minute=round(total_words / total_minutes, 1),
        sample_size=sample_size,
        default_used=False,
    )


# ── Start / End a study session ──────────────────────────────────

@router.post("/sessions/start", response_model=SessionOut, status_code=201)
def start_session(
    body: SessionStart,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Start a new study session. Auto-closes any open session for this user first."""
    if body.activity_type not in VALID_ACTIVITIES:
        raise HTTPException(status_code=400, detail=f"Invalid activity_type. Must be one of: {', '.join(VALID_ACTIVITIES)}")

    now = datetime.now(timezone.utc)

    # Auto-close any previously open session
    open_session = (
        db.query(StudySession)
        .filter(StudySession.user_id == current_user_id, StudySession.ended_at.is_(None))
        .first()
    )
    if open_session:
        open_session.ended_at = now
        raw_secs = (now - open_session.started_at.replace(tzinfo=timezone.utc)).total_seconds()
        open_session.duration_secs = min(raw_secs, MAX_SESSION_SECS)

    new_session = StudySession(
        user_id=current_user_id,
        activity_type=body.activity_type,
        category=body.category,
        paper_id=body.paper_id,
        started_at=now,
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


@router.post("/sessions/end", response_model=Optional[SessionOut])
def end_session(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """End the currently open session for this user."""
    now = datetime.now(timezone.utc)
    open_session = (
        db.query(StudySession)
        .filter(StudySession.user_id == current_user_id, StudySession.ended_at.is_(None))
        .first()
    )
    if not open_session:
        return None

    open_session.ended_at = now
    raw_secs = (now - open_session.started_at.replace(tzinfo=timezone.utc)).total_seconds()
    open_session.duration_secs = min(raw_secs, MAX_SESSION_SECS)
    db.commit()
    db.refresh(open_session)
    return open_session


# ── Current active session ───────────────────────────────────────

@router.get("/sessions/current", response_model=Optional[SessionOut])
def get_current_session(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Return the user's currently open session, if any."""
    return (
        db.query(StudySession)
        .filter(StudySession.user_id == current_user_id, StudySession.ended_at.is_(None))
        .first()
    )


# ── Recent sessions history ─────────────────────────────────────

@router.get("/sessions/history", response_model=List[SessionOut])
def get_session_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Return the user's recent sessions (most recent first)."""
    return (
        db.query(StudySession)
        .filter(StudySession.user_id == current_user_id, StudySession.duration_secs.isnot(None))
        .order_by(StudySession.started_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


# ── Weekly summary ───────────────────────────────────────────────

@router.get("/weekly", response_model=WeeklySummary)
def get_weekly_summary(
    week_offset: int = Query(0, ge=0, le=52, description="0 = current week, 1 = last week, etc."),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Aggregated weekly summary with breakdowns by:
    1. Activity type (reading, chatbot, groups, plagiarism, home)
    2. Reading category / subject
    3. Daily totals (Mon–Sun)
    """
    now = datetime.now(timezone.utc)
    monday = _monday_of(now) - timedelta(weeks=week_offset)
    sunday = monday + timedelta(days=6, hours=23, minutes=59, seconds=59)

    sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id == current_user_id,
            StudySession.started_at >= monday,
            StudySession.started_at <= sunday,
            StudySession.duration_secs.isnot(None),
        )
        .all()
    )

    # Aggregate by activity type
    activity_map: dict[str, float] = defaultdict(float)
    category_map: dict[str, float] = defaultdict(float)
    daily_map: dict[str, float] = defaultdict(float)
    total_secs = 0.0

    for s in sessions:
        dur = min(s.duration_secs or 0.0, MAX_SESSION_SECS)
        total_secs += dur
        activity_map[s.activity_type] += dur

        # Reading category breakdown
        if s.activity_type == "reading" and s.category:
            category_map[s.category] += dur

        # Daily breakdown (use start date)
        day_key = s.started_at.strftime("%Y-%m-%d")
        daily_map[day_key] += dur

    by_activity = sorted(
        [ActivityBreakdown(activity_type=k, total_seconds=v, formatted=_fmt(v)) for k, v in activity_map.items()],
        key=lambda x: x.total_seconds,
        reverse=True,
    )

    by_category = sorted(
        [CategoryBreakdown(category=k, total_seconds=v, formatted=_fmt(v)) for k, v in category_map.items()],
        key=lambda x: x.total_seconds,
        reverse=True,
    )

    # Fill in all 7 days even if no data
    daily: list[DailyPoint] = []
    for i in range(7):
        day = monday + timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        secs = daily_map.get(day_str, 0.0)
        daily.append(DailyPoint(date=day_str, total_seconds=secs, formatted=_fmt(secs)))

    return WeeklySummary(
        week_start=monday.strftime("%Y-%m-%d"),
        week_end=sunday.strftime("%Y-%m-%d"),
        total_seconds=total_secs,
        total_formatted=_fmt(total_secs),
        by_activity=by_activity,
        by_category=by_category,
        daily=daily,
    )


# ── Bulk reading stats for friends (used by friends/activity service) ─────

@router.post("/reading-stats-bulk", response_model=ReadingStatsBulkResponse)
def reading_stats_bulk(
    body: ReadingStatsBulkRequest,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Return reading time (and by category) for the given user_ids.
    Intended to be called by the friends/activity service with the requester's
    friend IDs so insights can show trending subjects and most active readers by time.
    """
    if not body.user_ids:
        return ReadingStatsBulkResponse(users=[])

    # Limit to avoid abuse
    user_ids = body.user_ids[:50] if len(body.user_ids) > 50 else body.user_ids

    sessions = (
        db.query(StudySession)
        .filter(
            StudySession.user_id.in_(user_ids),
            StudySession.activity_type == "reading",
            StudySession.duration_secs.isnot(None),
        )
        .all()
    )

    # Aggregate per user: total_seconds and by category
    user_total: dict[int, float] = defaultdict(float)
    user_categories: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for s in sessions:
        dur = s.duration_secs or 0.0
        user_total[s.user_id] += dur
        if s.category:
            user_categories[s.user_id][s.category] += dur

    users_list: list[UserReadingStats] = []
    for uid in user_ids:
        total = user_total.get(uid, 0.0)
        by_cat = [
            UserCategorySeconds(category=k, total_seconds=v)
            for k, v in sorted(user_categories.get(uid, {}).items(), key=lambda x: -x[1])
        ]
        users_list.append(
            UserReadingStats(
                user_id=uid,
                total_seconds=total,
                formatted=_fmt(total),
                by_category=by_cat,
            )
        )

    return ReadingStatsBulkResponse(users=users_list)
