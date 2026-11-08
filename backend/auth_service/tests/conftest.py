import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from auth_service.main import app
from auth_service.core.limiter import reset_login_rate_limits
from auth_service.database import Base
from auth_service.database import get_db as real_get_db


@pytest.fixture(scope="session")
def test_db_path(tmp_path_factory):
    # Use a temporary file-backed SQLite DB to avoid threading issues
    db_file = tmp_path_factory.mktemp("auth_db") / "test_auth.db"
    return f"sqlite:///{db_file}"


@pytest.fixture(scope="session")
def test_engine(test_db_path):
    engine = create_engine(test_db_path, connect_args={"check_same_thread": False})
    # Fresh schema for the test engine
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture()
def db_session(test_engine):
    TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    # Ensure clean tables per test (optional: drop/create for isolation)
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client(db_session):
    reset_login_rate_limits()
    # Override the app's get_db dependency to point to our test session
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[real_get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    reset_login_rate_limits()
