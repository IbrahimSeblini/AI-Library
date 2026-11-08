from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, RefreshToken
from ..schemas import UserCreate, UserOut, TokenOut, UserUpdate, RefreshRequest
from ..core.security import (
    hash_password, verify_password, create_access_token, generate_refresh_token,
    validate_password_strength, LOCKOUT_DURATION_MINUTES, MAX_FAILED_ATTEMPTS,
)
from ..core.config import settings
from ..core.limiter import check_login_failure_limit, clear_login_failures, record_login_failure
from ..deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


def _make_token_pair(user_id: int, db: Session) -> TokenOut:
    """Issue a fresh access + refresh token pair and persist the refresh token."""
    access_token = create_access_token({"sub": str(user_id)})
    refresh_value = generate_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(user_id=user_id, token=refresh_value, expires_at=expires_at))
    db.commit()
    return TokenOut(access_token=access_token, refresh_token=refresh_value)


@router.post("/register", response_model=UserOut)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    err = validate_password_strength(payload.password)
    if err:
        raise HTTPException(status_code=400, detail=err)
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenOut)
def login(request: Request, payload: UserCreate, db: Session = Depends(get_db)):
    check_login_failure_limit(payload.email, request)
    user = db.query(User).filter(User.email == payload.email).first()

    if user and user.lockout_until:
        now = datetime.now(timezone.utc)
        lockout = user.lockout_until if user.lockout_until.tzinfo else user.lockout_until.replace(tzinfo=timezone.utc)
        if now < lockout:
            remaining = max(1, int((lockout - now).total_seconds() / 60) + 1)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Account locked. Try again in {remaining} minute(s).",
            )
        # Lockout expired — reset
        user.failed_login_attempts = 0
        user.lockout_until = None
        db.commit()

    if not user or not verify_password(payload.password, user.password_hash):
        record_login_failure(payload.email, request)
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
                user.lockout_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Successful login — reset lockout counters
    clear_login_failures(payload.email)
    user.failed_login_attempts = 0
    user.lockout_until = None
    return _make_token_pair(user.id, db)


@router.post("/refresh", response_model=TokenOut)
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    db_token = db.query(RefreshToken).filter(RefreshToken.token == payload.refresh_token).first()

    if not db_token or db_token.revoked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    expires_at = db_token.expires_at if db_token.expires_at.tzinfo else db_token.expires_at.replace(tzinfo=timezone.utc)
    if now > expires_at:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    # Rotate: revoke old token and issue a new pair
    db_token.revoked = True
    db.commit()
    return _make_token_pair(db_token.user_id, db)


@router.post("/logout")
def logout_user(payload: RefreshRequest, db: Session = Depends(get_db)):
    db_token = db.query(RefreshToken).filter(RefreshToken.token == payload.refresh_token).first()
    if db_token:
        db_token.revoked = True
        db.commit()
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(payload: UserUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.full_name is not None:
        current_user.full_name = payload.full_name.strip() or None
    if payload.new_password:
        if not payload.current_password:
            raise HTTPException(status_code=400, detail="Current password is required to set a new password")
        if not verify_password(payload.current_password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/users/search", response_model=List[UserOut])
def search_users(
    q: str = Query("", description="Search query (email or username)"),
    exclude_user_id: int = Query(None, description="User ID to exclude from results"),
    db: Session = Depends(get_db),
):
    if not q or len(q.strip()) < 2:
        return []
    search_term = f"%{q.strip()}%"
    query = db.query(User).filter(
        (User.email.ilike(search_term)) | (User.full_name.ilike(search_term))
    ).filter(User.is_active == True)
    if exclude_user_id:
        query = query.filter(User.id != exclude_user_id)
    return query.limit(20).all()


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
