import re
import secrets
from datetime import datetime, timedelta, timezone
from jose import jwt
from passlib.hash import pbkdf2_sha256
from .config import settings

LOCKOUT_DURATION_MINUTES = 15
MAX_FAILED_ATTEMPTS = 10


def hash_password(password: str) -> str:
    return pbkdf2_sha256.using(rounds=29000).hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pbkdf2_sha256.verify(password, password_hash)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def generate_refresh_token() -> str:
    return secrets.token_hex(64)


def validate_password_strength(password: str) -> str | None:
    """Returns an error message or None if the password meets requirements."""
    if len(password) < 8:
        return "Password must be at least 8 characters"
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return "Password must contain at least one lowercase letter"
    if not re.search(r"\d", password):
        return "Password must contain at least one number"
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must contain at least one special character (!@#$%^&* etc.)"
    return None
