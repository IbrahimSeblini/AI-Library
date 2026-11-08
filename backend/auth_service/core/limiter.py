from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

ACCOUNT_FAILED_LOGIN_LIMIT = 5
IP_FAILED_LOGIN_LIMIT = 50
FAILED_LOGIN_WINDOW = timedelta(minutes=10)

_account_failed_login_attempts: dict[str, list[datetime]] = {}
_ip_failed_login_attempts: dict[str, list[datetime]] = {}


def _account_key(account_identifier: str) -> str:
    return account_identifier.strip().lower()


def _recent_failures(store: dict[str, list[datetime]], key: str, now: datetime) -> list[datetime]:
    cutoff = now - FAILED_LOGIN_WINDOW
    failures = [
        failed_at
        for failed_at in store.get(key, [])
        if failed_at > cutoff
    ]
    if failures:
        store[key] = failures
    else:
        store.pop(key, None)
    return failures


def check_login_failure_limit(account_identifier: str, request: Request) -> None:
    now = datetime.now(timezone.utc)
    account_failures = _recent_failures(_account_failed_login_attempts, _account_key(account_identifier), now)
    if len(account_failures) >= ACCOUNT_FAILED_LOGIN_LIMIT:
        retry_after = max(1, int((account_failures[0] + FAILED_LOGIN_WINDOW - now).total_seconds()))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts for this account. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    ip_failures = _recent_failures(_ip_failed_login_attempts, get_remote_address(request), now)
    if len(ip_failures) >= IP_FAILED_LOGIN_LIMIT:
        retry_after = max(1, int((ip_failures[0] + FAILED_LOGIN_WINDOW - now).total_seconds()))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts from this network. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )


def record_login_failure(account_identifier: str, request: Request) -> None:
    now = datetime.now(timezone.utc)
    account_key = _account_key(account_identifier)
    account_failures = _recent_failures(_account_failed_login_attempts, account_key, now)
    account_failures.append(now)
    _account_failed_login_attempts[account_key] = account_failures

    ip_key = get_remote_address(request)
    ip_failures = _recent_failures(_ip_failed_login_attempts, ip_key, now)
    ip_failures.append(now)
    _ip_failed_login_attempts[ip_key] = ip_failures


def clear_login_failures(account_identifier: str) -> None:
    _account_failed_login_attempts.pop(_account_key(account_identifier), None)


def reset_login_rate_limits() -> None:
    _account_failed_login_attempts.clear()
    _ip_failed_login_attempts.clear()
