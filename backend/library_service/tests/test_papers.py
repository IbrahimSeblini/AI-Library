from http import HTTPStatus
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.base import Base
from app.db.session import get_db as real_get_db

# All paper/category endpoints require X-User-Id (per-user library)
USER_HEADERS = {"X-User-Id": "1"}


@pytest.fixture(scope="session")
def test_db_path(tmp_path_factory):
    db_file = tmp_path_factory.mktemp("library_db") / "test_library.db"
    return f"sqlite:///{db_file}"


@pytest.fixture(scope="session")
def test_engine(test_db_path):
    engine = create_engine(test_db_path, connect_args={"check_same_thread": False})
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture()
def db_session(test_engine):
    TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[real_get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == HTTPStatus.OK
    assert resp.json() == {"ok": True, "service": "library"}


def test_create_and_get_paper(client):
    payload = {
        "title": "Test Paper",
        "authors": ["Dr. Test Author"],
        "publication_year": 2024,
        "subject": "Test Subject",
        "summary": "This is a test paper summary",
        "full_text": "This is the full text of the test paper."
    }
    r = client.post("/api/v1/papers", json=payload, headers=USER_HEADERS)
    assert r.status_code == HTTPStatus.OK
    body = r.json()
    assert body["title"] == payload["title"]
    assert body["authors"] == payload["authors"]
    assert "id" in body

    # Get the paper
    paper_id = body["id"]
    r2 = client.get(f"/api/v1/papers/{paper_id}", headers=USER_HEADERS)
    assert r2.status_code == HTTPStatus.OK
    assert r2.json()["title"] == payload["title"]


def test_search_papers(client):
    # Create a test paper
    payload = {
        "title": "Machine Learning Basics",
        "authors": ["Dr. AI Expert"],
        "publication_year": 2023,
        "subject": "Machine Learning",
        "summary": "Introduction to machine learning",
        "full_text": "Machine learning is a subset of artificial intelligence."
    }
    client.post("/api/v1/papers", json=payload, headers=USER_HEADERS)

    # Search for it
    r = client.get("/api/v1/papers/search?q=machine", headers=USER_HEADERS)
    assert r.status_code == HTTPStatus.OK
    results = r.json()
    assert len(results) > 0
    assert any("machine" in p["title"].lower() or "machine" in p["summary"].lower() for p in results)


def test_get_categories(client):
    # Create papers with different subjects
    papers = [
        {"title": "Paper 1", "authors": ["Author 1"], "publication_year": 2023, "subject": "Physics", "summary": "Summary 1", "full_text": "Text 1"},
        {"title": "Paper 2", "authors": ["Author 2"], "publication_year": 2023, "subject": "Chemistry", "summary": "Summary 2", "full_text": "Text 2"},
    ]
    for paper in papers:
        client.post("/api/v1/papers", json=paper, headers=USER_HEADERS)

    r = client.get("/api/v1/categories", headers=USER_HEADERS)
    assert r.status_code == HTTPStatus.OK
    categories = r.json()
    assert "Physics" in categories
    assert "Chemistry" in categories

