from http import HTTPStatus

from jose import jwt

from auth_service.core.config import settings
from auth_service.core.limiter import reset_login_rate_limits
from auth_service.core.security import hash_password
from auth_service.models import RefreshToken, User


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == HTTPStatus.OK
    assert resp.json() == {"ok": True}


def test_register_and_login_and_me_flow(client):
    # Register
    payload = {
        "email": "alice@example.com",
        "password": "StrongP@ssw0rd",
        "full_name": "Alice"
    }
    r = client.post("/auth/register", json=payload)
    assert r.status_code == HTTPStatus.OK, r.text
    body = r.json()
    assert body["email"] == payload["email"]
    assert body["full_name"] == payload["full_name"]
    assert body["is_active"] is True
    assert "id" in body
    assert "created_at" in body

    # Register duplicate should fail
    r2 = client.post("/auth/register", json=payload)
    assert r2.status_code == HTTPStatus.BAD_REQUEST

    # Login success
    r3 = client.post("/auth/login", json={
        "email": payload["email"],
        "password": payload["password"],
        "full_name": None
    })
    assert r3.status_code == HTTPStatus.OK, r3.text
    token_body = r3.json()
    assert "access_token" in token_body
    assert "refresh_token" in token_body
    assert token_body.get("token_type") == "bearer"
    access_claims = jwt.decode(token_body["access_token"], settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    assert "exp" in access_claims

    token = token_body["access_token"]

    # /me requires auth
    r4 = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r4.status_code == HTTPStatus.OK
    me = r4.json()
    assert me["email"] == payload["email"]
    assert me["full_name"] == payload["full_name"]


def test_login_invalid_credentials(client):
    # Seed a user
    client.post("/auth/register", json={
        "email": "bob@example.com",
        "password": "CorrectHorseBatteryStaple1!",
        "full_name": "Bob"
    })

    # Wrong password
    r = client.post("/auth/login", json={
        "email": "bob@example.com",
        "password": "wrong",
        "full_name": None
    })
    assert r.status_code == HTTPStatus.UNAUTHORIZED


def test_me_unauthorized_without_token(client):
    r = client.get("/auth/me")
    assert r.status_code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN)


def test_registration_requires_strong_password(client):
    weak_passwords = [
        "Short1!",
        "lowercase1!",
        "UPPERCASE1!",
        "NoDigits!",
        "NoSpecial1",
    ]

    for idx, password in enumerate(weak_passwords):
        resp = client.post("/auth/register", json={
            "email": f"weak{idx}@example.com",
            "password": password,
            "full_name": "Weak Password",
        })
        assert resp.status_code == HTTPStatus.BAD_REQUEST


def test_existing_weak_password_user_can_still_login(client, db_session):
    user = User(
        email="legacy@example.com",
        password_hash=hash_password("weak"),
        full_name="Legacy User",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    resp = client.post("/auth/login", json={
        "email": "legacy@example.com",
        "password": "weak",
        "full_name": None,
    })

    assert resp.status_code == HTTPStatus.OK, resp.text
    body = resp.json()
    assert body["access_token"]
    assert body["refresh_token"]


def test_refresh_token_rotation_revokes_old_token(client, db_session):
    payload = {
        "email": "refresh@example.com",
        "password": "StrongP@ssw0rd",
        "full_name": "Refresh User",
    }
    client.post("/auth/register", json=payload)
    login_resp = client.post("/auth/login", json={
        "email": payload["email"],
        "password": payload["password"],
        "full_name": None,
    })
    old_refresh = login_resp.json()["refresh_token"]

    refresh_resp = client.post("/auth/refresh", json={"refresh_token": old_refresh})

    assert refresh_resp.status_code == HTTPStatus.OK, refresh_resp.text
    new_refresh = refresh_resp.json()["refresh_token"]
    assert new_refresh != old_refresh
    assert db_session.query(RefreshToken).filter_by(token=old_refresh).one().revoked is True

    reused_resp = client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert reused_resp.status_code == HTTPStatus.UNAUTHORIZED


def test_login_rate_limit_counts_failed_attempts_per_account(client):
    payload = {
        "email": "ratelimit@example.com",
        "password": "StrongP@ssw0rd",
        "full_name": "Rate Limit User",
    }
    other_payload = {
        "email": "other-ratelimit@example.com",
        "password": "StrongP@ssw0rd",
        "full_name": "Other Rate Limit User",
    }
    client.post("/auth/register", json=payload)
    client.post("/auth/register", json=other_payload)

    for _ in range(5):
        resp = client.post("/auth/login", json={
            "email": payload["email"],
            "password": "wrong",
            "full_name": None,
        })
        assert resp.status_code == HTTPStatus.UNAUTHORIZED

    blocked = client.post("/auth/login", json={
        "email": payload["email"],
        "password": payload["password"],
        "full_name": None,
    })
    assert blocked.status_code == HTTPStatus.TOO_MANY_REQUESTS

    other_account = client.post("/auth/login", json={
        "email": other_payload["email"],
        "password": other_payload["password"],
        "full_name": None,
    })
    assert other_account.status_code == HTTPStatus.OK, other_account.text


def test_login_rate_limit_also_counts_failed_attempts_per_ip(client):
    payload = {
        "email": "ip-ratelimit@example.com",
        "password": "StrongP@ssw0rd",
        "full_name": "IP Rate Limit User",
    }
    client.post("/auth/register", json=payload)

    for idx in range(50):
        resp = client.post("/auth/login", json={
            "email": f"spray{idx}@example.com",
            "password": "wrong",
            "full_name": None,
        })
        assert resp.status_code == HTTPStatus.UNAUTHORIZED

    blocked = client.post("/auth/login", json={
        "email": payload["email"],
        "password": payload["password"],
        "full_name": None,
    })
    assert blocked.status_code == HTTPStatus.TOO_MANY_REQUESTS
    assert "network" in blocked.json()["detail"]


def test_account_locks_after_ten_consecutive_failed_logins(client):
    payload = {
        "email": "lockout@example.com",
        "password": "StrongP@ssw0rd",
        "full_name": "Lockout User",
    }
    client.post("/auth/register", json=payload)

    for _ in range(10):
        resp = client.post("/auth/login", json={
            "email": payload["email"],
            "password": "wrong",
            "full_name": None,
        })
        assert resp.status_code == HTTPStatus.UNAUTHORIZED
        reset_login_rate_limits()

    locked = client.post("/auth/login", json={
        "email": payload["email"],
        "password": payload["password"],
        "full_name": None,
    })
    assert locked.status_code == HTTPStatus.TOO_MANY_REQUESTS
    assert "Account locked" in locked.json()["detail"]
