"""
Tests for the Knowledge Roadmap mastery system.

All Gemini API calls are mocked — no real API key required.
All HTTP calls to library service are mocked via httpx.
Uses an in-memory SQLite database per test for full isolation.
"""

import json
import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# ── Import the app FIRST, then patch module-level objects ─────────────────────
import roadmap_service.main as roadmap_main
from roadmap_service.main import (
    Base,
    PaperMastery,
    PaperView,
    QuizAttempt,
    RoadmapCache,
    app,
)

USER_ID = 1
PAPER_ID = 42


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture()
def test_db(tmp_path):
    """File-based SQLite DB in a temp dir, fresh for each test."""
    db_file = tmp_path / "test_mastery.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    yield engine, TestSession
    engine.dispose()


@pytest.fixture()
def client(test_db):
    """TestClient with the in-memory DB patched in."""
    engine, TestSession = test_db
    # Patch module-level SessionLocal so all endpoint functions use the test DB
    with patch.object(roadmap_main, "SessionLocal", TestSession):
        with TestClient(app) as c:
            yield c


@pytest.fixture()
def db_session(test_db):
    """Direct DB session for seeding / asserting state."""
    _, TestSession = test_db
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


def _headers(user_id: int = USER_ID) -> dict:
    return {"X-User-Id": str(user_id)}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _seed_roadmap(db_session, user_id: int = USER_ID, paper_ids: list = None):
    """Insert a 'ready' roadmap cache with one concept node."""
    if paper_ids is None:
        paper_ids = [PAPER_ID]

    node = {
        "id": "c-test0001",
        "name": "Test Concept",
        "type": "method",
        "description": "A test concept.",
        "importance": 3,
        "mastery_state": 1,
        "paper_ids": paper_ids,
        "paper_titles": {str(p): f"Paper {p}" for p in paper_ids},
        "subject_cluster": "Computer Science",
    }
    cache = RoadmapCache(
        user_id=user_id,
        graph_data=json.dumps({"nodes": [node], "edges": []}),
        paper_ids_included=json.dumps(paper_ids),
        status="ready",
    )
    db_session.add(cache)
    db_session.commit()
    return node


def _add_quiz_correct(db_session, user_id: int, paper_id: int, correct: int, total: int = None):
    """Insert a QuizAttempt row."""
    if total is None:
        total = correct
    db_session.add(QuizAttempt(user_id=user_id, paper_id=paper_id, correct_count=correct, total_count=total))
    db_session.commit()


def _mock_highlights(paper_ids: list = None):
    """Return a mock httpx response for GET /api/v1/highlights."""
    highlights = [{"paper_id": pid} for pid in (paper_ids or [])]
    mock_resp = MagicMock()
    mock_resp.is_success = True
    mock_resp.json.return_value = highlights
    return mock_resp


# ══════════════════════════════════════════════════════════════════════════════
# Test 1 — Paper view tracking → Reading state (STATE 2)
# ══════════════════════════════════════════════════════════════════════════════

def test_track_view_creates_reading_state(client, db_session):
    """POST /track-view must record the view and mastery-status must reflect STATE 2."""
    resp = client.post("/track-view", params={"paper_id": PAPER_ID}, headers=_headers())
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Row must exist in paper_views
    row = db_session.query(PaperView).filter_by(user_id=USER_ID, paper_id=PAPER_ID).first()
    assert row is not None, "PaperView row not created"

    # Duplicate view must NOT create a second row
    client.post("/track-view", params={"paper_id": PAPER_ID}, headers=_headers())
    count = db_session.query(PaperView).filter_by(user_id=USER_ID, paper_id=PAPER_ID).count()
    assert count == 1, "Duplicate PaperView rows created"


# ══════════════════════════════════════════════════════════════════════════════
# Test 2 — Engaged state via quiz attempt (STATE 3)
# ══════════════════════════════════════════════════════════════════════════════

def test_quiz_attempt_triggers_engaged_state(client, db_session):
    """Submitting a quiz result (even 0 correct) bumps the paper to STATE 3."""
    # Seed a roadmap so mastery-update has something to update
    _seed_roadmap(db_session)

    resp = client.post(
        "/quiz-result",
        params={"paper_id": PAPER_ID, "correct": 2, "total": 5},
        headers=_headers(),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["cumulative_correct"] == 2

    # DB must have the attempt
    attempt = db_session.query(QuizAttempt).filter_by(user_id=USER_ID, paper_id=PAPER_ID).first()
    assert attempt is not None
    assert attempt.correct_count == 2


# ══════════════════════════════════════════════════════════════════════════════
# Test 3 — Quiz result saving + cumulative count
# ══════════════════════════════════════════════════════════════════════════════

def test_quiz_result_cumulates_correctly(client, db_session):
    """Multiple quiz attempts must accumulate their correct counts."""
    _seed_roadmap(db_session)

    for correct in [3, 4, 3]:  # total = 10
        resp = client.post(
            "/quiz-result",
            params={"paper_id": PAPER_ID, "correct": correct, "total": 5},
            headers=_headers(),
        )
        assert resp.status_code == 200

    final = resp.json()
    assert final["cumulative_correct"] == 10
    assert final["can_mark_mastered"] is True


# ══════════════════════════════════════════════════════════════════════════════
# Test 4 — Mark as Mastered gate (blocked without 10 correct)
# ══════════════════════════════════════════════════════════════════════════════

def test_mark_mastered_blocked_below_threshold(client, db_session):
    """mark-mastered must return HTTP 400 when cumulative correct < 10."""
    _add_quiz_correct(db_session, USER_ID, PAPER_ID, correct=5)

    resp = client.post("/mark-mastered", params={"paper_id": PAPER_ID}, headers=_headers())
    assert resp.status_code == 400
    assert "5/10" in resp.json()["detail"]


# ══════════════════════════════════════════════════════════════════════════════
# Test 5 — Mark as Mastered success (≥ 10 correct)
# ══════════════════════════════════════════════════════════════════════════════

def test_mark_mastered_succeeds_at_threshold(client, db_session):
    """mark-mastered must succeed and return upgraded concept count when ≥ 10 correct."""
    _seed_roadmap(db_session)
    _add_quiz_correct(db_session, USER_ID, PAPER_ID, correct=10)

    resp = client.post("/mark-mastered", params={"paper_id": PAPER_ID}, headers=_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["count"] >= 1  # At least the seeded concept

    # mastery-status should now report is_mastered = True
    status = client.get("/mastery-status", params={"paper_id": PAPER_ID}, headers=_headers())
    assert status.json()["is_mastered"] is True


# ══════════════════════════════════════════════════════════════════════════════
# Test 6 — Concept inheritance: highest state wins
# ══════════════════════════════════════════════════════════════════════════════

def test_concept_state_inherits_max_paper_state(client, db_session):
    """
    A concept linked to two papers must take the higher of the two paper states.
    Paper 10: STATE 1 (never viewed), Paper 11: STATE 2 (viewed) → concept = STATE 2.
    """
    paper_a, paper_b = 10, 11

    # Seed roadmap with concept linked to both papers
    node = {
        "id": "c-multi001",
        "name": "Multi-Paper Concept",
        "type": "method",
        "description": "Spans two papers.",
        "importance": 2,
        "mastery_state": 1,
        "paper_ids": [paper_a, paper_b],
        "paper_titles": {str(paper_a): "Paper A", str(paper_b): "Paper B"},
        "subject_cluster": "General",
    }
    cache = RoadmapCache(
        user_id=USER_ID,
        graph_data=json.dumps({"nodes": [node], "edges": []}),
        paper_ids_included=json.dumps([paper_a, paper_b]),
        status="ready",
    )
    db_session.add(cache)
    db_session.commit()

    # View only paper_b → STATE 2
    db_session.add(PaperView(user_id=USER_ID, paper_id=paper_b))
    db_session.commit()

    # Mock library service highlights (none)
    mock_resp = _mock_highlights([])
    with patch("roadmap_service.main.httpx.Client") as mock_client_cls:
        mock_client_cls.return_value.__enter__.return_value.get.return_value = mock_resp
        resp = client.get("/mastery-update", headers=_headers())

    assert resp.status_code == 200
    updated = resp.json()["updated_nodes"]
    # The concept should have been upgraded (1 → 2)
    updated_node = next((n for n in updated if n["id"] == "c-multi001"), None)
    assert updated_node is not None, "Concept was not updated"
    assert updated_node["new_state"] == 2


# ══════════════════════════════════════════════════════════════════════════════
# Test 7 — Undo mastered
# ══════════════════════════════════════════════════════════════════════════════

def test_undo_mastered(client, db_session):
    """undo-mastered must clear the manually_marked flag."""
    _add_quiz_correct(db_session, USER_ID, PAPER_ID, correct=10)

    # Mark it first
    client.post("/mark-mastered", params={"paper_id": PAPER_ID}, headers=_headers())
    assert client.get("/mastery-status", params={"paper_id": PAPER_ID}, headers=_headers()).json()["is_mastered"] is True

    # Undo
    resp = client.post("/undo-mastered", params={"paper_id": PAPER_ID}, headers=_headers())
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    # mastery-status must return is_mastered = False
    status = client.get("/mastery-status", params={"paper_id": PAPER_ID}, headers=_headers()).json()
    assert status["is_mastered"] is False
    # Quiz progress must still be visible (not erased by undo)
    assert status["quiz_correct_count"] == 10


# ══════════════════════════════════════════════════════════════════════════════
# Test 8 — mastery-update performance (< 1 000 ms)
# ══════════════════════════════════════════════════════════════════════════════

def test_mastery_update_performance(client, db_session):
    """GET /mastery-update must complete in under 1 000 ms for a single-concept roadmap."""
    _seed_roadmap(db_session)

    mock_resp = _mock_highlights([])
    with patch("roadmap_service.main.httpx.Client") as mock_client_cls:
        mock_client_cls.return_value.__enter__.return_value.get.return_value = mock_resp
        start = time.monotonic()
        resp = client.get("/mastery-update", headers=_headers())
        elapsed_ms = (time.monotonic() - start) * 1000

    assert resp.status_code == 200
    assert elapsed_ms < 1000, f"mastery-update took {elapsed_ms:.0f}ms (limit 1000ms)"


# ══════════════════════════════════════════════════════════════════════════════
# Test 9 — mastery-status returns correct fields
# ══════════════════════════════════════════════════════════════════════════════

def test_mastery_status_fields(client, db_session):
    """mastery-status must return all required fields with correct types."""
    _add_quiz_correct(db_session, USER_ID, PAPER_ID, correct=7)

    resp = client.get("/mastery-status", params={"paper_id": PAPER_ID}, headers=_headers())
    assert resp.status_code == 200
    data = resp.json()

    assert "is_mastered" in data
    assert "quiz_correct_count" in data
    assert "quiz_threshold" in data
    assert "can_mark_mastered" in data
    assert "remaining" in data

    assert data["quiz_correct_count"] == 7
    assert data["quiz_threshold"] == 10
    assert data["can_mark_mastered"] is False
    assert data["remaining"] == 3
    assert data["is_mastered"] is False


# ══════════════════════════════════════════════════════════════════════════════
# Test 10 — Full end-to-end mastery flow
# ══════════════════════════════════════════════════════════════════════════════

def test_full_mastery_flow(client, db_session):
    """
    Complete lifecycle:
    1. Open paper → STATE 2 (Reading)
    2. Submit quiz (partial) → STATE 3 (Engaged)
    3. Submit more quiz → cumulative hits 10 → can_mark_mastered = True
    4. Mark as Mastered → STATE 4
    5. Undo → no longer mastered
    """
    _seed_roadmap(db_session)
    mock_resp = _mock_highlights([])

    # Step 1: View paper
    r = client.post("/track-view", params={"paper_id": PAPER_ID}, headers=_headers())
    assert r.status_code == 200

    # Verify STATE 2 on roadmap node
    with patch("roadmap_service.main.httpx.Client") as m:
        m.return_value.__enter__.return_value.get.return_value = mock_resp
        update = client.get("/mastery-update", headers=_headers()).json()
    # The seeded node starts at state 1, should now be 2
    updated_ids = {n["id"]: n["new_state"] for n in update["updated_nodes"]}
    assert updated_ids.get("c-test0001") == 2

    # Step 2: Quiz attempt (partial) — marks as Engaged (STATE 3)
    r = client.post("/quiz-result", params={"paper_id": PAPER_ID, "correct": 4, "total": 5}, headers=_headers())
    assert r.json()["can_mark_mastered"] is False

    # Step 3: More attempts until threshold
    r = client.post("/quiz-result", params={"paper_id": PAPER_ID, "correct": 6, "total": 5}, headers=_headers())
    assert r.json()["cumulative_correct"] == 10
    assert r.json()["can_mark_mastered"] is True

    # mastery-status: can mark but not yet mastered
    status = client.get("/mastery-status", params={"paper_id": PAPER_ID}, headers=_headers()).json()
    assert status["can_mark_mastered"] is True
    assert status["is_mastered"] is False

    # Step 4: Mark as Mastered
    r = client.post("/mark-mastered", params={"paper_id": PAPER_ID}, headers=_headers())
    assert r.json()["success"] is True
    status = client.get("/mastery-status", params={"paper_id": PAPER_ID}, headers=_headers()).json()
    assert status["is_mastered"] is True

    # Step 5: Undo
    client.post("/undo-mastered", params={"paper_id": PAPER_ID}, headers=_headers())
    status = client.get("/mastery-status", params={"paper_id": PAPER_ID}, headers=_headers()).json()
    assert status["is_mastered"] is False
    assert status["quiz_correct_count"] == 10  # progress preserved
