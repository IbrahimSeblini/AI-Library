import json
import os
import time
from typing import List, Optional
from pathlib import Path
from dotenv import load_dotenv

import httpx
from fastapi import BackgroundTasks, FastAPI, Request, Response, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

# Load environment variables
BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)

# Configuration via environment variables with sensible defaults
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")
LIBRARY_SERVICE_URL = os.getenv("LIBRARY_SERVICE_URL", "http://localhost:8002")
GROUPS_SERVICE_URL = os.getenv("GROUPS_SERVICE_URL", "http://localhost:8003")
LIBRARIAN_SERVICE_URL = os.getenv("LIBRARIAN_SERVICE_URL", "http://localhost:8004")
QUIZ_SERVICE_URL = os.getenv("QUIZ_SERVICE_URL", "http://localhost:8005")
PLAGIARISM_SERVICE_URL = os.getenv("PLAGIARISM_SERVICE_URL", "http://localhost:8100")
SUMMARY_SERVICE_URL = os.getenv("SUMMARY_SERVICE_URL", "http://localhost:8110")
PARAPHRASE_SERVICE_URL = os.getenv("PARAPHRASE_SERVICE_URL", "http://localhost:8120")
COUNTER_SERVICE_URL = os.getenv("COUNTER_SERVICE_URL", "http://localhost:8125")
ROADMAP_SERVICE_URL = os.getenv("ROADMAP_SERVICE_URL", "http://localhost:8130")
FRIENDS_SERVICE_URL = os.getenv("FRIENDS_SERVICE_URL", "http://localhost:8200")
TRACKER_SERVICE_URL = os.getenv("TRACKER_SERVICE_URL", "http://localhost:8210")
JUDGE_SERVICE_URL = os.getenv("JUDGE_SERVICE_URL", "http://localhost:8140")
JUDGE_INTERNAL_KEY = os.getenv("JUDGE_INTERNAL_KEY", "changeme-judge")
COURSE_SERVICE_URL = os.getenv("COURSE_SERVICE_URL", "http://localhost:8006")
FRONTEND_ORIGINS = os.getenv("FRONTEND_ORIGINS", "*")
JWT_SECRET = os.getenv("JWT_SECRET", "changeme")
JWT_ALG = os.getenv("JWT_ALG", "HS256")

security = HTTPBearer()

app = FastAPI(title="Gateway API", version="1.0")

allow_origins: List[str]
if FRONTEND_ORIGINS.strip() == "*":
    allow_origins = ["*"]
else:
    allow_origins = [o.strip() for o in FRONTEND_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"ok": True, "gateway": True}


@app.post("/api/ai-feedback")
async def record_ai_feedback(request: Request):
    """Capture lightweight user feedback for AI outputs."""
    user_id = extract_user_id_from_token(request)
    if not user_id:
        return Response(
            content=b'{"detail":"Authentication required. Please login first."}',
            status_code=401,
            headers={"Content-Type": "application/json"}
        )
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    feature = str(body.get("feature") or "").strip()[:80]
    rating = str(body.get("rating") or "").strip()
    if not feature or rating not in {"helpful", "not_helpful"}:
        raise HTTPException(status_code=400, detail="feature and rating are required.")

    record = {
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "user_id": user_id,
        "feature": feature,
        "context_id": str(body.get("context_id") or "")[:200],
        "rating": rating,
        "metadata": body.get("metadata") if isinstance(body.get("metadata"), dict) else {},
    }
    feedback_path = BASE_DIR.parent / "data" / "ai_feedback.jsonl"
    feedback_path.parent.mkdir(parents=True, exist_ok=True)
    with feedback_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return {"ok": True}


def extract_user_id_from_token(request: Request) -> Optional[int]:
    """Extract user ID from JWT token in Authorization header"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    
    token = auth_header.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
        return int(user_id) if user_id else None
    except (JWTError, ValueError):
        return None


async def _proxy(request: Request, target_base: str, path: str, add_user_id: bool = False, timeout: float = 30.0) -> Response:
    """Forward the incoming request to target_base/path and return the response."""
    url = f"{target_base.rstrip('/')}/{path.lstrip('/')}"

    # Prepare forwarded headers
    headers = dict(request.headers)
    # Optional: remove host header so upstream can set its own
    headers.pop("host", None)

    # Add user ID header if requested and token is present
    if add_user_id:
        user_id = extract_user_id_from_token(request)
        if user_id:
            headers["X-User-Id"] = str(user_id)
        else:
            # If user ID is required but not found, return 401
            # Don't forward to service - it will fail validation anyway
            return Response(
                content=b'{"detail":"Authentication required. Please login first."}',
                status_code=401,
                headers={"Content-Type": "application/json"}
            )

    # Read body
    body = await request.body()

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.request(
            request.method,
            url,
            headers=headers,
            params=request.query_params,
            content=body,
            follow_redirects=True,
        )

    # Filter out hop-by-hop headers per RFC (very small set)
    excluded_headers = {"transfer-encoding", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "upgrade"}
    response_headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded_headers}
    # Ensure CORS headers on all proxy responses (including 4xx/5xx) so browser doesn't block
    origin = request.headers.get("origin")
    if origin and (not allow_origins or "*" in allow_origins or origin in allow_origins):
        response_headers["Access-Control-Allow-Origin"] = origin
    elif allow_origins and "*" in allow_origins:
        response_headers["Access-Control-Allow-Origin"] = "*"
    if allow_origins:
        response_headers["Access-Control-Allow-Credentials"] = "true"
    return Response(content=resp.content, status_code=resp.status_code, headers=response_headers)


async def _fire_judgment(feature: str, input_data: dict, output_data: dict, user_id: int, latency_ms: int):
    """Fire-and-forget: send input+output to judge service. Silently swallows all errors."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(
                f"{JUDGE_SERVICE_URL}/judge/{feature}",
                json={"input_data": input_data, "output_data": output_data,
                      "user_id": user_id, "latency_ms": latency_ms},
                headers={"X-Internal-Key": JUDGE_INTERNAL_KEY},
            )
    except Exception:
        pass


# Auth service proxy (no user ID needed)
@app.api_route("/auth/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_auth(path: str, request: Request):
    return await _proxy(request, AUTH_SERVICE_URL, f"/auth/{path}", add_user_id=False)


# Auth service proxy via /api/auth (for frontend consistency)
@app.api_route("/api/auth/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_auth_api(path: str, request: Request):
    return await _proxy(request, AUTH_SERVICE_URL, f"/auth/{path}", add_user_id=False)


# Paper mastery endpoints (roadmap service) — must be BEFORE generic papers route
def _paper_id_int(paper_id: str):
    """Coerce path paper_id to int; raise HTTPException 400 if invalid (avoids 422 from Pydantic)."""
    try:
        return int(paper_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid paper id: must be an integer.")


@app.api_route("/api/papers/{paper_id}/mastery-status", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_paper_mastery_status(paper_id: str, request: Request):
    """GET /api/papers/{id}/mastery-status — mastery info for a paper"""
    pid = _paper_id_int(paper_id)
    return await _proxy(request, ROADMAP_SERVICE_URL, f"/mastery-status?paper_id={pid}", add_user_id=True, timeout=10.0)


@app.api_route("/api/papers/{paper_id}/mark-mastered", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_paper_mark_mastered(paper_id: str, request: Request):
    """POST /api/papers/{id}/mark-mastered — mark paper as mastered"""
    pid = _paper_id_int(paper_id)
    return await _proxy(request, ROADMAP_SERVICE_URL, f"/mark-mastered?paper_id={pid}", add_user_id=True, timeout=15.0)


@app.api_route("/api/papers/{paper_id}/undo-mastered", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_paper_undo_mastered(paper_id: str, request: Request):
    """POST /api/papers/{id}/undo-mastered — undo mastery mark"""
    pid = _paper_id_int(paper_id)
    return await _proxy(request, ROADMAP_SERVICE_URL, f"/undo-mastered?paper_id={pid}", add_user_id=True, timeout=10.0)


# Library service proxy (papers endpoints — require auth: each user sees only their library)
# PDF ingestion upload: longer timeout for extract + Gemini structuring
@app.api_route("/api/papers/upload", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_papers_upload(request: Request):
    return await _proxy(request, LIBRARY_SERVICE_URL, "/api/v1/papers/upload", add_user_id=True, timeout=120.0)


@app.api_route("/api/papers/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_papers(path: str, request: Request):
    return await _proxy(request, LIBRARY_SERVICE_URL, f"/api/v1/papers/{path}", add_user_id=True)


@app.api_route("/api/papers", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_papers_root(request: Request):
    return await _proxy(request, LIBRARY_SERVICE_URL, "/api/v1/papers", add_user_id=True)


@app.api_route("/api/categories", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_categories(request: Request):
    return await _proxy(request, LIBRARY_SERVICE_URL, "/api/v1/categories", add_user_id=True)


# Highlights endpoints (requires user ID)
# More specific route (root) must come before path parameter route
@app.api_route("/api/highlights", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_highlights_root(request: Request):
    return await _proxy(request, LIBRARY_SERVICE_URL, "/api/v1/highlights", add_user_id=True)


@app.api_route("/api/highlights/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_highlights(path: str, request: Request):
    return await _proxy(request, LIBRARY_SERVICE_URL, f"/api/v1/highlights/{path}", add_user_id=True)


@app.api_route("/api/notes", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_notes_root(request: Request):
    return await _proxy(request, LIBRARY_SERVICE_URL, "/api/v1/notes", add_user_id=True)


@app.api_route("/api/notes/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_notes(path: str, request: Request):
    return await _proxy(request, LIBRARY_SERVICE_URL, f"/api/v1/notes/{path}", add_user_id=True)


# Notes summary endpoints — explicit routes with 90s timeout (before catch-all)
@app.api_route("/api/groups/{group_id}/papers/{paper_id}/notes-summary", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_paper_notes_summary(group_id: int, paper_id: int, request: Request):
    """Route for per-paper notes summary (AI-powered, longer timeout)"""
    return await _proxy(request, GROUPS_SERVICE_URL, f"/api/v1/groups/{group_id}/papers/{paper_id}/notes-summary", add_user_id=True, timeout=90.0)


@app.api_route("/api/groups/{group_id}/notes-summary", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_group_notes_summary(group_id: int, request: Request):
    """Route for group-wide notes summary (AI-powered, longer timeout)"""
    return await _proxy(request, GROUPS_SERVICE_URL, f"/api/v1/groups/{group_id}/notes-summary", add_user_id=True, timeout=90.0)


# Groups service proxy (requires user ID from JWT)
# IMPORTANT: Root route must come BEFORE path parameter route for proper matching
@app.api_route("/api/groups", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_groups_root(request: Request):
    """Route for /api/groups (list/create groups)"""
    return await _proxy(request, GROUPS_SERVICE_URL, "/api/v1/groups", add_user_id=True)


@app.api_route("/api/groups/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_groups(path: str, request: Request):
    """
    Route for all nested group endpoints:
    - /api/groups/{groupId}
    - /api/groups/{groupId}/papers
    - /api/groups/{groupId}/papers/{paperId}
    - /api/groups/{groupId}/highlights
    - /api/groups/{groupId}/highlights/{highlightId}
    - /api/groups/{groupId}/papers/{paperId}/highlights
    - /api/groups/{groupId}/comments
    - /api/groups/{groupId}/comments/{commentId}
    - /api/groups/{groupId}/papers/{paperId}/comments
    - /api/groups/{groupId}/invitations
    All routes go through gateway to groups_service
    """
    return await _proxy(request, GROUPS_SERVICE_URL, f"/api/v1/groups/{path}", add_user_id=True)


@app.api_route("/api/invitations/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_invitations(path: str, request: Request):
    return await _proxy(request, GROUPS_SERVICE_URL, f"/api/v1/invitations/{path}", add_user_id=True)


@app.api_route("/api/invitations", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_invitations_root(request: Request):
    return await _proxy(request, GROUPS_SERVICE_URL, "/api/v1/invitations", add_user_id=True)


# Librarian service proxy (requires user ID from JWT)
@app.api_route("/api/librarian/conversations", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_librarian_conversations_root(request: Request):
    """Route for /api/librarian/conversations (list/create conversations)"""
    return await _proxy(request, LIBRARIAN_SERVICE_URL, "/api/v1/conversations", add_user_id=True)


@app.api_route("/api/librarian/conversations/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_librarian_conversations(path: str, request: Request):
    """Route for conversation-specific endpoints"""
    return await _proxy(request, LIBRARIAN_SERVICE_URL, f"/api/v1/conversations/{path}", add_user_id=True)


@app.api_route("/api/librarian/messages", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_librarian_messages(request: Request, background_tasks: BackgroundTasks):
    """Route for /api/librarian/messages (send message, creates conversation if needed)"""
    body_bytes = await request.body()
    t0 = time.monotonic()
    response = await _proxy(request, LIBRARIAN_SERVICE_URL, "/api/v1/messages", add_user_id=True)
    latency_ms = int((time.monotonic() - t0) * 1000)
    if response.status_code == 200 and request.method == "POST":
        try:
            raw_input = json.loads(body_bytes)
            output_data = json.loads(response.body)
            user_id = extract_user_id_from_token(request) or 0
            # Enrich input with assistant reply content so the judge has context
            # even though the RAG fetch happens inside librarian_service
            assistant_content = ""
            try:
                assistant_content = output_data.get("assistant_message", {}).get("content", "")
            except Exception:
                pass
            input_data = {
                "user_message": raw_input.get("content", ""),
                "conversation_id": raw_input.get("conversation_id"),
                "note": "RAG context is fetched internally by librarian_service. Judge based on response quality.",
                "assistant_reply_preview": assistant_content[:500] if assistant_content else "",
            }
            background_tasks.add_task(_fire_judgment, "librarian", input_data, output_data, user_id, latency_ms)
        except Exception:
            pass
    return response


# Quiz service proxy (no user ID needed for quiz generation)
@app.api_route("/api/quiz/submit-result", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_quiz_submit_result(request: Request):
    """POST /api/quiz/submit-result — save quiz results to roadmap service for mastery tracking"""
    return await _proxy(request, ROADMAP_SERVICE_URL, "/quiz-result", add_user_id=True, timeout=10.0)


@app.api_route("/api/quiz/generate", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_quiz_generate(request: Request, background_tasks: BackgroundTasks):
    """Route for /api/quiz/generate (generate quiz from text)"""
    body_bytes = await request.body()
    t0 = time.monotonic()
    response = await _proxy(request, QUIZ_SERVICE_URL, "/quizzes/generate", add_user_id=False)
    latency_ms = int((time.monotonic() - t0) * 1000)
    if response.status_code == 200:
        try:
            input_data = json.loads(body_bytes)
            output_data = json.loads(response.body)
            user_id = extract_user_id_from_token(request) or 0
            background_tasks.add_task(_fire_judgment, "quiz", input_data, output_data, user_id, latency_ms)
        except Exception:
            pass
    return response


@app.api_route("/api/quiz/health", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_quiz_health(request: Request):
    """Route for quiz service health check"""
    return await _proxy(request, QUIZ_SERVICE_URL, "/health", add_user_id=False)


# Plagiarism service proxy
@app.api_route("/api/plagiarism/check", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_plagiarism_check(request: Request):
    """Route for /api/plagiarism/check"""
    return await _proxy(request, PLAGIARISM_SERVICE_URL, "/check", add_user_id=False)


@app.api_route("/api/plagiarism/health", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_plagiarism_health(request: Request):
    """Route for plagiarism service health check"""
    return await _proxy(request, PLAGIARISM_SERVICE_URL, "/health", add_user_id=False)


# Summary service proxy (with explicit 503 when service unreachable)
async def _proxy_summary(request: Request, path: str) -> Response:
    """Proxy to summary service; return 503 with clear detail if unreachable."""
    try:
        return await _proxy(request, SUMMARY_SERVICE_URL, path, add_user_id=False)
    except Exception as e:
        err = type(e).__name__ + " " + str(e)
        if any(x in err.lower() for x in ("connect", "refused", "timeout", "reset")):
            return Response(
                content=b'{"detail":"Summary service unreachable. Is it running on port 8110? Run \\"python start_all.py\\" or \\"python -m summary_service\\" from the backend."}',
                status_code=503,
                headers={"Content-Type": "application/json"},
            )
        raise


@app.api_route("/api/summary/summarize", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_summary_summarize(request: Request, background_tasks: BackgroundTasks):
    """Route for /api/summary/summarize (generate summary from text)"""
    body_bytes = await request.body()
    t0 = time.monotonic()
    response = await _proxy_summary(request, "/summarize")
    latency_ms = int((time.monotonic() - t0) * 1000)
    if response.status_code == 200:
        try:
            input_data = json.loads(body_bytes)
            output_data = json.loads(response.body)
            user_id = extract_user_id_from_token(request) or 0
            background_tasks.add_task(_fire_judgment, "summary", input_data, output_data, user_id, latency_ms)
        except Exception:
            pass
    return response


@app.api_route("/api/summary/health", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_summary_health(request: Request):
    """Route for summary service health check"""
    return await _proxy_summary(request, "/health")


# Paraphrase service proxy
async def _proxy_paraphrase(request: Request, path: str) -> Response:
    """Proxy to paraphrase service; return 503 with clear detail if unreachable."""
    try:
        return await _proxy(request, PARAPHRASE_SERVICE_URL, path, add_user_id=False)
    except Exception as e:
        err = type(e).__name__ + " " + str(e)
        if any(x in err.lower() for x in ("connect", "refused", "timeout", "reset")):
            return Response(
                content=b'{"detail":"Paraphrase service unreachable. Is it running on port 8120? Run \\"python start_all.py\\" or \\"python -m paraphrase_service\\" from the backend."}',
                status_code=503,
                headers={"Content-Type": "application/json"},
            )
        raise


@app.api_route("/api/paraphrase/paraphrase", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_paraphrase_paraphrase(request: Request, background_tasks: BackgroundTasks):
    """Route for /api/paraphrase/paraphrase (paraphrase text)"""
    body_bytes = await request.body()
    t0 = time.monotonic()
    response = await _proxy_paraphrase(request, "/paraphrase")
    latency_ms = int((time.monotonic() - t0) * 1000)
    if response.status_code == 200:
        try:
            input_data = json.loads(body_bytes)
            output_data = json.loads(response.body)
            user_id = extract_user_id_from_token(request) or 0
            background_tasks.add_task(_fire_judgment, "paraphrase", input_data, output_data, user_id, latency_ms)
        except Exception:
            pass
    return response


@app.api_route("/api/paraphrase/health", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_paraphrase_health(request: Request):
    """Route for paraphrase service health check"""
    return await _proxy_paraphrase(request, "/health")


# Counterarguments service proxy
async def _proxy_counter(request: Request, path: str) -> Response:
    """Proxy to counterarguments service; return 503 with clear detail if unreachable."""
    try:
        return await _proxy(request, COUNTER_SERVICE_URL, path, add_user_id=False)
    except Exception as e:
        err = type(e).__name__ + " " + str(e)
        if any(x in err.lower() for x in ("connect", "refused", "timeout", "reset")):
            return Response(
                content=b'{"detail":"Counterarguments service unreachable. Is it running on port 8125? Run \\"python start_all.py\\" or \\"python -m counterarguments_service\\" from the backend."}',
                status_code=503,
                headers={"Content-Type": "application/json"},
            )
        raise


@app.api_route("/api/counter/counter", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_counter_counter(request: Request, background_tasks: BackgroundTasks):
    """Route for /api/counter/counter (generate counterarguments)"""
    body_bytes = await request.body()
    t0 = time.monotonic()
    response = await _proxy_counter(request, "/counter")
    latency_ms = int((time.monotonic() - t0) * 1000)
    if response.status_code == 200:
        try:
            input_data = json.loads(body_bytes)
            output_data = json.loads(response.body)
            user_id = extract_user_id_from_token(request) or 0
            background_tasks.add_task(_fire_judgment, "counterarguments", input_data, output_data, user_id, latency_ms)
        except Exception:
            pass
    return response


@app.api_route("/api/counter/health", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_counter_health(request: Request):
    """Route for counterarguments service health check"""
    return await _proxy_counter(request, "/health")


# Group papers, highlights, and comments endpoints (requires user ID)
# These routes are handled by the catch-all /api/groups/{path:path} route below


# Roadmap service proxy (requires user ID from JWT)
@app.api_route("/api/roadmap/mastery-update", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_roadmap_mastery_update(request: Request):
    """GET /api/roadmap/mastery-update — lightweight mastery recalculation, no AI"""
    return await _proxy(request, ROADMAP_SERVICE_URL, "/mastery-update", add_user_id=True, timeout=15.0)


@app.api_route("/api/roadmap/mastery-batch", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_roadmap_mastery_batch(request: Request):
    """GET /api/roadmap/mastery-batch?paper_ids=1,2,3 — is_mastered for multiple papers"""
    return await _proxy(request, ROADMAP_SERVICE_URL, "/mastery-batch", add_user_id=True, timeout=10.0)


@app.api_route("/api/roadmap/mastery-evidence", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_roadmap_mastery_evidence(request: Request):
    """GET /api/roadmap/mastery-evidence?paper_ids=1,2,3 — explain mastery inputs"""
    return await _proxy(request, ROADMAP_SERVICE_URL, "/mastery-evidence", add_user_id=True, timeout=10.0)


@app.api_route("/api/roadmap/explain-concept", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_roadmap_explain_concept(request: Request, background_tasks: BackgroundTasks):
    """POST /api/roadmap/explain-concept — AI explanation for a concept"""
    body_bytes = await request.body()
    t0 = time.monotonic()
    response = await _proxy(request, ROADMAP_SERVICE_URL, "/explain-concept", add_user_id=True, timeout=30.0)
    latency_ms = int((time.monotonic() - t0) * 1000)
    if response.status_code == 200:
        try:
            input_data = json.loads(body_bytes)
            output_data = json.loads(response.body)
            user_id = extract_user_id_from_token(request) or 0
            background_tasks.add_task(_fire_judgment, "roadmap_explain", input_data, output_data, user_id, latency_ms)
        except Exception:
            pass
    return response


@app.api_route("/api/roadmap/generate", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_roadmap_generate(request: Request):
    """POST /api/roadmap/generate — trigger background generation"""
    return await _proxy(request, ROADMAP_SERVICE_URL, "/generate", add_user_id=True, timeout=10.0)


@app.api_route("/api/roadmap/status", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_roadmap_status(request: Request):
    """GET /api/roadmap/status — lightweight poll"""
    return await _proxy(request, ROADMAP_SERVICE_URL, "/status", add_user_id=True, timeout=10.0)


@app.api_route("/api/roadmap/track-view", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_roadmap_track_view(request: Request):
    """POST /api/roadmap/track-view?paper_id=N — track paper open for mastery"""
    return await _proxy(request, ROADMAP_SERVICE_URL, "/track-view", add_user_id=True, timeout=10.0)


@app.api_route("/api/roadmap/health", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_roadmap_health(request: Request):
    return await _proxy(request, ROADMAP_SERVICE_URL, "/health", add_user_id=False, timeout=10.0)


@app.api_route("/api/roadmap", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_roadmap_root(request: Request):
    """GET /api/roadmap — return saved graph data"""
    return await _proxy(request, ROADMAP_SERVICE_URL, "/", add_user_id=True, timeout=10.0)


@app.api_route("/api/roadmap/plans/generate", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_roadmap_plans_generate(request: Request):
    """POST /api/roadmap/plans/generate — create a new personalized study plan"""
    return await _proxy(request, ROADMAP_SERVICE_URL, "/plans/generate", add_user_id=True, timeout=15.0)


@app.api_route("/api/roadmap/plans/active", methods=["GET", "OPTIONS", "HEAD"])
async def proxy_roadmap_plans_active(request: Request):
    """GET /api/roadmap/plans/active — fetch current active study plan"""
    return await _proxy(request, ROADMAP_SERVICE_URL, "/plans/active", add_user_id=True, timeout=10.0)


@app.api_route("/api/roadmap/plans/{plan_id}/tasks/{task_id}", methods=["PATCH", "OPTIONS", "HEAD"])
async def proxy_roadmap_plans_update_task(plan_id: int, task_id: int, request: Request):
    """PATCH /api/roadmap/plans/{plan_id}/tasks/{task_id} — update a single task"""
    return await _proxy(request, ROADMAP_SERVICE_URL, f"/plans/{plan_id}/tasks/{task_id}", add_user_id=True, timeout=10.0)


@app.api_route("/api/roadmap/plans/{plan_id}/recompute", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_roadmap_plans_recompute(plan_id: int, request: Request):
    """POST /api/roadmap/plans/{plan_id}/recompute — adapt plan to new mastery data"""
    return await _proxy(request, ROADMAP_SERVICE_URL, f"/plans/{plan_id}/recompute", add_user_id=True, timeout=15.0)


# Friends service proxy (requires JWT auth)
@app.api_route("/api/friends/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_friends(path: str, request: Request):
    return await _proxy(request, FRIENDS_SERVICE_URL, f"/friends/{path}", add_user_id=False)


@app.api_route("/api/friends", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_friends_root(request: Request):
    return await _proxy(request, FRIENDS_SERVICE_URL, "/friends/", add_user_id=False)


# Activity service proxy (part of friends service, requires JWT auth)
@app.api_route("/api/activity/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_activity(path: str, request: Request):
    return await _proxy(request, FRIENDS_SERVICE_URL, f"/activity/{path}", add_user_id=False)


@app.api_route("/api/activity", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_activity_root(request: Request):
    return await _proxy(request, FRIENDS_SERVICE_URL, "/activity/", add_user_id=False)


# Study Tracker service proxy (requires JWT auth)
@app.api_route("/api/tracker/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_tracker(path: str, request: Request):
    return await _proxy(request, TRACKER_SERVICE_URL, f"/tracker/{path}", add_user_id=False)


@app.api_route("/api/tracker", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_tracker_root(request: Request):
    return await _proxy(request, TRACKER_SERVICE_URL, "/tracker/", add_user_id=False)


# Course service proxy (requires user ID from JWT)
@app.api_route("/api/courses", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_courses_root(request: Request):
    return await _proxy(request, COURSE_SERVICE_URL, "/courses", add_user_id=True, timeout=120.0)


@app.api_route("/api/courses/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_courses(path: str, request: Request):
    return await _proxy(request, COURSE_SERVICE_URL, f"/courses/{path}", add_user_id=True, timeout=120.0)


# Course quiz endpoint — multi-paper quiz generation
@app.api_route("/api/quiz/generate-course", methods=["POST", "OPTIONS", "HEAD"])
async def proxy_quiz_generate_course(request: Request):
    return await _proxy(request, QUIZ_SERVICE_URL, "/quizzes/generate-course", add_user_id=False, timeout=120.0)


# Legacy catch-all for backward compatibility
# NOTE: This should NOT be needed since we have explicit routes above,
# but kept for safety. Routes above will match first.
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_api(path: str, request: Request):
    """
    Fallback route for /api/* requests.
    Routes are matched in order, so specific routes above take precedence.
    This ensures all group-related requests go through the gateway to groups_service.
    """
    if path.startswith("papers") or path.startswith("categories"):
        remaining = path.split("/", 1)[1] if "/" in path else ""
        if path.startswith("papers"):
            api_path = f"/api/v1/papers/{remaining}" if remaining else "/api/v1/papers"
        else:
            api_path = "/api/v1/categories"
        return await _proxy(request, LIBRARY_SERVICE_URL, api_path, add_user_id=True)
    elif path.startswith("groups") or path.startswith("invitations"):
        # Route to groups service with user ID - ALL group requests go through gateway
        remaining = path.split("/", 1)[1] if "/" in path else ""
        if path.startswith("groups"):
            api_path = f"/api/v1/groups/{remaining}" if remaining else "/api/v1/groups"
        else:
            api_path = f"/api/v1/invitations/{remaining}" if remaining else "/api/v1/invitations"
        return await _proxy(request, GROUPS_SERVICE_URL, api_path, add_user_id=True)
    elif path.startswith("highlights"):
        # Route to library service with user ID
        remaining = path.split("/", 1)[1] if "/" in path else ""
        api_path = f"/api/v1/highlights/{remaining}" if remaining else "/api/v1/highlights"
        return await _proxy(request, LIBRARY_SERVICE_URL, api_path, add_user_id=True)
    elif path.startswith("librarian"):
        # Route to librarian service with user ID
        remaining = path.split("/", 1)[1] if "/" in path else ""
        api_path = f"/api/v1/{remaining}" if remaining else "/api/v1"
        return await _proxy(request, LIBRARIAN_SERVICE_URL, api_path, add_user_id=True)
    elif path.startswith("quiz"):
        # Route to quiz service (no user ID needed)
        remaining = path.split("/", 1)[1] if "/" in path else ""
        if remaining == "generate":
            api_path = "/quizzes/generate"
        elif remaining == "health":
            api_path = "/health"
        else:
            api_path = f"/{remaining}" if remaining else "/"
        return await _proxy(request, QUIZ_SERVICE_URL, api_path, add_user_id=False)
    elif path.startswith("plagiarism"):
        remaining = path.split("/", 1)[1] if "/" in path else ""
        api_path = "/check" if remaining == "check" else "/health" if remaining == "health" else f"/{remaining}" if remaining else "/"
        return await _proxy(request, PLAGIARISM_SERVICE_URL, api_path, add_user_id=False)
    elif path.startswith("summary"):
        remaining = path.split("/", 1)[1] if "/" in path else ""
        api_path = "/summarize" if remaining == "summarize" else "/health" if remaining == "health" else f"/{remaining}" if remaining else "/"
        return await _proxy(request, SUMMARY_SERVICE_URL, api_path, add_user_id=False)
    elif path.startswith("paraphrase"):
        remaining = path.split("/", 1)[1] if "/" in path else ""
        api_path = "/paraphrase" if remaining == "paraphrase" else "/health" if remaining == "health" else f"/{remaining}" if remaining else "/"
        return await _proxy(request, PARAPHRASE_SERVICE_URL, api_path, add_user_id=False)
    elif path.startswith("counter"):
        remaining = path.split("/", 1)[1] if "/" in path else ""
        api_path = "/counter" if remaining == "counter" else "/health" if remaining == "health" else f"/{remaining}" if remaining else "/"
        return await _proxy(request, COUNTER_SERVICE_URL, api_path, add_user_id=False)
    else:
        # Default to library service for backward compatibility
        return await _proxy(request, LIBRARY_SERVICE_URL, f"/api/v1/{path}", add_user_id=False)


@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_catch_all(full_path: str, request: Request):
    """If path starts with known prefixes forward, otherwise return 404 with hint."""
    if full_path.startswith("auth/"):
        return await _proxy(request, AUTH_SERVICE_URL, full_path, add_user_id=False)
    if full_path.startswith("api/"):
        # Delegate to proxy_api
        remaining = full_path[len("api/"):]
        return await proxy_api(remaining, request)
    return Response(content=b"Not Found - gateway only proxies /auth/* and /api/*", status_code=404)
