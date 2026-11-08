from http import HTTPStatus
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.base import Base
from app.db.session import get_db as real_get_db
from app.db.models.group_paper import GroupPaper
from app.db.models.group_highlight import GroupHighlight
from app.db.models.group_comment import GroupComment
from app.db.models.group_notes_summary import GroupNotesSummary, GroupPaperNotesSummary


@pytest.fixture(scope="session")
def test_db_path(tmp_path_factory):
    db_file = tmp_path_factory.mktemp("groups_db") / "test_groups.db"
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
    assert resp.json() == {"ok": True, "service": "groups"}


def test_create_group(client):
    payload = {
        "name": "Test Group",
        "description": "A test study group",
        "is_public": True
    }
    r = client.post("/api/v1/groups", json=payload, headers={"X-User-Id": "1"})
    assert r.status_code == HTTPStatus.OK
    body = r.json()
    assert body["name"] == payload["name"]
    assert body["description"] == payload["description"]
    assert "id" in body
    assert len(body["members"]) == 1  # Owner is automatically added


def test_get_groups(client):
    # Create a group
    payload = {
        "name": "Public Group",
        "description": "A public group",
        "is_public": True
    }
    client.post("/api/v1/groups", json=payload, headers={"X-User-Id": "1"})

    # Get groups
    r = client.get("/api/v1/groups", headers={"X-User-Id": "2"})
    assert r.status_code == HTTPStatus.OK
    groups = r.json()
    assert len(groups) > 0
    assert any(g["name"] == "Public Group" for g in groups)


def test_public_group_shows_members_but_hides_papers_from_non_members(client, db_session):
    payload = {
        "name": "Discoverable Group",
        "description": "Visible metadata only",
        "is_public": True
    }
    r = client.post("/api/v1/groups", json=payload, headers={"X-User-Id": "1"})
    group_id = r.json()["id"]
    db_session.add(GroupPaper(group_id=group_id, paper_id=42, paper_title="Private Shared Paper", added_by=1))
    db_session.commit()

    list_resp = client.get("/api/v1/groups", headers={"X-User-Id": "2"})
    public_group = next(g for g in list_resp.json() if g["id"] == group_id)
    assert len(public_group["members"]) == 1
    assert public_group["members"][0]["id"] == 1
    assert public_group["members"][0]["email"] == ""
    assert public_group["papers"] == []

    detail_resp = client.get(f"/api/v1/groups/{group_id}", headers={"X-User-Id": "2"})
    assert detail_resp.status_code == HTTPStatus.OK
    detail = detail_resp.json()
    assert len(detail["members"]) == 1
    assert detail["members"][0]["id"] == 1
    assert detail["members"][0]["email"] == ""
    assert detail["papers"] == []


def test_private_group_hidden_from_non_members(client):
    payload = {
        "name": "Private Group",
        "description": "Members only",
        "is_public": False
    }
    r = client.post("/api/v1/groups", json=payload, headers={"X-User-Id": "1"})
    group_id = r.json()["id"]

    detail_resp = client.get(f"/api/v1/groups/{group_id}", headers={"X-User-Id": "2"})
    assert detail_resp.status_code == HTTPStatus.NOT_FOUND


def test_public_group_join_reveals_internal_group_data(client, db_session):
    payload = {
        "name": "Joinable Group",
        "description": "Join to view",
        "is_public": True
    }
    r = client.post("/api/v1/groups", json=payload, headers={"X-User-Id": "1"})
    group_id = r.json()["id"]
    db_session.add(GroupPaper(group_id=group_id, paper_id=7, paper_title="Visible After Join", added_by=1))
    db_session.commit()

    join_resp = client.post(f"/api/v1/groups/{group_id}/join", headers={"X-User-Id": "2"})

    assert join_resp.status_code == HTTPStatus.OK
    body = join_resp.json()
    assert any(member["id"] == 2 for member in body["members"])
    assert [paper["title"] for paper in body["papers"]] == ["Visible After Join"]


def test_non_member_cannot_open_group_paper(client, db_session):
    payload = {
        "name": "Paper Gate",
        "description": "Paper access requires membership",
        "is_public": True
    }
    r = client.post("/api/v1/groups", json=payload, headers={"X-User-Id": "1"})
    group_id = r.json()["id"]
    db_session.add(GroupPaper(group_id=group_id, paper_id=99, paper_title="Members Only", added_by=1))
    db_session.commit()

    paper_resp = client.get(f"/api/v1/groups/{group_id}/papers/99", headers={"X-User-Id": "2"})
    assert paper_resp.status_code == HTTPStatus.FORBIDDEN


def test_leaving_group_removes_users_shared_papers_and_notes(client, db_session):
    payload = {
        "name": "Leave Cleanup",
        "description": "Leaving removes shared data",
        "is_public": True
    }
    r = client.post("/api/v1/groups", json=payload, headers={"X-User-Id": "1"})
    group_id = r.json()["id"]
    client.post(f"/api/v1/groups/{group_id}/join", headers={"X-User-Id": "2"})
    db_session.add(GroupPaper(group_id=group_id, paper_id=11, paper_title="Leaving User Paper", added_by=2))
    db_session.add(GroupHighlight(
        group_id=group_id,
        paper_id=11,
        user_id=2,
        color="yellow",
        highlighted_text="private highlight",
        start_offset=0,
        end_offset=7,
    ))
    db_session.add(GroupComment(
        group_id=group_id,
        paper_id=11,
        user_id=2,
        commented_text="private",
        comment_text="private comment",
        start_offset=0,
        end_offset=7,
    ))
    db_session.commit()

    leave_resp = client.delete(f"/api/v1/groups/{group_id}/leave", headers={"X-User-Id": "2"})

    assert leave_resp.status_code == HTTPStatus.OK
    assert db_session.query(GroupPaper).filter_by(group_id=group_id, added_by=2).count() == 0
    assert db_session.query(GroupHighlight).filter_by(group_id=group_id, user_id=2).count() == 0
    assert db_session.query(GroupComment).filter_by(group_id=group_id, user_id=2).count() == 0


def test_notes_summaries_are_persisted_and_regenerable(client, db_session):
    payload = {
        "name": "Persistent Summaries",
        "description": "Cached notes summaries",
        "is_public": True
    }
    r = client.post("/api/v1/groups", json=payload, headers={"X-User-Id": "1"})
    group_id = r.json()["id"]
    db_session.add(GroupPaper(group_id=group_id, paper_id=15, paper_title="Cached Paper", added_by=1))
    db_session.commit()

    paper_get = client.get(f"/api/v1/groups/{group_id}/papers/15/notes-summary", headers={"X-User-Id": "1"})
    group_get = client.get(f"/api/v1/groups/{group_id}/notes-summary", headers={"X-User-Id": "1"})
    assert paper_get.status_code == HTTPStatus.OK
    assert group_get.status_code == HTTPStatus.OK
    assert db_session.query(GroupPaperNotesSummary).filter_by(group_id=group_id, paper_id=15).count() == 1
    assert db_session.query(GroupNotesSummary).filter_by(group_id=group_id).count() == 1

    paper_row = db_session.query(GroupPaperNotesSummary).filter_by(group_id=group_id, paper_id=15).one()
    paper_row.available = True
    paper_row.summary = "Cached paper summary"
    group_row = db_session.query(GroupNotesSummary).filter_by(group_id=group_id).one()
    group_row.available = True
    group_row.summary = "Cached group summary"
    db_session.commit()

    cached_paper = client.get(f"/api/v1/groups/{group_id}/papers/15/notes-summary", headers={"X-User-Id": "1"})
    cached_group = client.get(f"/api/v1/groups/{group_id}/notes-summary", headers={"X-User-Id": "1"})
    assert cached_paper.json()["summary"] == "Cached paper summary"
    assert cached_group.json()["summary"] == "Cached group summary"

    regen = client.post(f"/api/v1/groups/{group_id}/notes-summary/regenerate-all", headers={"X-User-Id": "1"})
    assert regen.status_code == HTTPStatus.OK
    assert regen.json()["available"] is False


def test_invite_user(client):
    # Create a group
    payload = {
        "name": "Test Group",
        "description": "Test",
        "is_public": False
    }
    r = client.post("/api/v1/groups", json=payload, headers={"X-User-Id": "1"})
    group_id = r.json()["id"]

    # Invite user
    invite_payload = {
        "group_id": group_id,
        "invited_user_id": 2
    }
    r2 = client.post(f"/api/v1/groups/{group_id}/invitations", json=invite_payload, headers={"X-User-Id": "1"})
    assert r2.status_code == HTTPStatus.OK
    assert r2.json()["status"] == "pending"
