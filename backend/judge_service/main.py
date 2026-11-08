import asyncio
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from sqlalchemy import func
from sqlalchemy.orm import Session

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env", override=True)

# ── Config ────────────────────────────────────────────────────────────────────
JUDGE_ADMIN_USER = os.getenv("JUDGE_ADMIN_USER", "admin")
JUDGE_ADMIN_PASSWORD = os.getenv("JUDGE_ADMIN_PASSWORD", "changeme")
JUDGE_JWT_SECRET = os.getenv("JUDGE_JWT_SECRET", "judge-secret-changeme")
JUDGE_INTERNAL_KEY = os.getenv("JUDGE_INTERNAL_KEY", "changeme-judge")
JUDGE_JWT_ALG = "HS256"
JUDGE_JWT_EXPIRE_MINUTES = 30

# Service URLs for CI test execution
SUMMARY_SERVICE_URL = os.getenv("SUMMARY_SERVICE_URL", "http://localhost:8110")
PARAPHRASE_SERVICE_URL = os.getenv("PARAPHRASE_SERVICE_URL", "http://localhost:8120")
COUNTER_SERVICE_URL = os.getenv("COUNTER_SERVICE_URL", "http://localhost:8125")
QUIZ_SERVICE_URL = os.getenv("QUIZ_SERVICE_URL", "http://localhost:8005")
LIBRARIAN_SERVICE_URL = os.getenv("LIBRARIAN_SERVICE_URL", "http://localhost:8004")
ROADMAP_SERVICE_URL = os.getenv("ROADMAP_SERVICE_URL", "http://localhost:8130")

PASS_THRESHOLD = float(os.getenv("JUDGE_PASS_THRESHOLD", "5.0"))
CI_DEFAULT_CASE_LIMIT = int(os.getenv("JUDGE_CI_DAILY_CASE_LIMIT", "100"))
# HH:MM in UTC — set to "" to disable the built-in daily scheduler
CI_DAILY_SCHEDULE    = os.getenv("JUDGE_DAILY_SCHEDULE", "06:00")
CI_FEATURE_QUOTAS = {
    "summary":          12,  # 120 pool → 12/run
    "paraphrase":        8,  # 80  pool → 8/run
    "quiz":             16,  # 160 pool → 16/run
    "counterarguments": 16,  # 160 pool → 16/run
    "librarian":        12,  # 120 pool → 12/run
    "roadmap_graph":    24,  # 240 pool → 24/run
    "roadmap_explain":  12,  # 120 pool → 12/run
}  # total per run: 100

CI_CORE_CASE_DESCRIPTIONS = {
    # These descriptions are always included in a run (up to quota).
    # Remaining quota slots are filled by rotating through the rest of the pool.
    "summary": {
        "Dense scientific paragraph – small summary",
        "[OUTLIER] Single-sentence input – minimal content to summarize",
    },
    "paraphrase": {
        "Technical sentence with jargon",
    },
    "quiz": {
        "Biology passage – 2 easy 2 normal questions",
        "[OUTLIER] Single-sentence passage – insufficient material for many questions",
    },
    "counterarguments": {
        "Initial mode – argumentative technology claim",
        "[OUTLIER] Vague one-line claim – insufficient substance to argue against",
    },
    "librarian": {
        "User asks about a paper in mock library context",
        "[OUTLIER] Single-word greeting – off-topic non-question",
    },
    "roadmap_graph": {
        "Transformer paper abstract — concept extraction",
        "Deep reinforcement learning paper abstract — concept extraction",
        "CRISPR gene editing paper abstract — concept extraction",
        "[OUTLIER] Single-sentence abstract – minimal text for concept extraction",
        "[OUTLIER] Entirely vague abstract with no specific methodology – generic content",
    },
    "roadmap_explain": {
        "Explain Backpropagation in Machine Learning context",
        "[OUTLIER] Potentially fabricated or non-standard concept name",
    },
}

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="AI Judge Service", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB ────────────────────────────────────────────────────────────────────────
import database as db_module
from database import get_db
from models import CIRun, CITestCase, Judgment
from schemas import (
    CIRunOut,
    CITestCaseCreate,
    CITestCaseOut,
    FeatureStats,
    JudgmentListOut,
    JudgmentOut,
    LoginRequest,
    StatsOut,
    TokenOut,
    JudgeRequest,
)


async def _daily_ci_scheduler() -> None:
    """Fires one CI run per day at the configured UTC time."""
    if not CI_DAILY_SCHEDULE:
        return
    try:
        hh, mm = (int(x) for x in CI_DAILY_SCHEDULE.split(":"))
    except Exception:
        print(f"[judge] Invalid JUDGE_DAILY_SCHEDULE '{CI_DAILY_SCHEDULE}' — auto-run disabled.")
        return

    print(f"[judge] Daily CI scheduler active — fires at {CI_DAILY_SCHEDULE} UTC.")
    while True:
        now = datetime.utcnow()
        next_run = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        sleep_secs = (next_run - datetime.utcnow()).total_seconds()
        print(f"[judge] Next scheduled CI run at {next_run.strftime('%Y-%m-%d %H:%M')} UTC "
              f"(in {int(sleep_secs // 3600)}h {int((sleep_secs % 3600) // 60)}m).")
        await asyncio.sleep(sleep_secs)

        # Create the run record and pick cases
        run_id: int | None = None
        case_ids: list[int] = []
        db = db_module.SessionLocal()
        try:
            cases = db.query(CITestCase).order_by(CITestCase.feature, CITestCase.id).all()
            if not cases:
                print("[judge] Scheduled CI: no test cases seeded, skipping.")
                continue
            selected = _select_ci_cases(cases, CI_DEFAULT_CASE_LIMIT)
            run = CIRun(
                triggered_by="scheduled",
                started_at=datetime.utcnow(),
                total_cases=len(selected),
            )
            db.add(run)
            db.commit()
            db.refresh(run)
            run_id = run.id
            case_ids = [c.id for c in selected]
        finally:
            db.close()

        if run_id is not None:
            print(f"[judge] Scheduled CI run #{run_id} started ({len(case_ids)} cases).")
            try:
                await _execute_ci_run(run_id, case_ids)
                print(f"[judge] Scheduled CI run #{run_id} complete.")
            except Exception as exc:
                print(f"[judge] Scheduled CI run #{run_id} failed: {exc}")


@app.on_event("startup")
async def on_startup():
    db_module.init_db()
    from seed_ci_cases import seed
    db = db_module.SessionLocal()
    resume_case_ids: list[int] = []
    try:
        n = seed(db)
        if n:
            print(f"[judge] Seeded {n} CI test cases.")

        # Recover any runs interrupted by a server restart
        orphaned = db.query(CIRun).filter(CIRun.finished_at.is_(None)).all()
        for run in orphaned:
            # Find which test case ids already have a judgment for this run
            completed_ids = {
                j.test_case_id
                for j in db.query(Judgment).filter(Judgment.ci_run_id == run.id).all()
                if j.test_case_id is not None
            }
            # All test cases that exist
            all_cases = db.query(CITestCase).all()
            # Re-queue the ones that were never reached
            missing = [c for c in all_cases if c.id not in completed_ids]
            # Re-run up to the same number that were originally planned but not reached
            remaining_count = run.total_cases - len(completed_ids)
            resume_case_ids = [c.id for c in missing[:remaining_count]]

            run.finished_at = datetime.utcnow()
            run.failed = run.total_cases - run.passed
            print(
                f"[judge] Orphaned CI run #{run.id}: {len(completed_ids)} completed, "
                f"{remaining_count} untested — will resume in a new run."
            )
        if orphaned:
            db.commit()
    finally:
        db.close()

    asyncio.create_task(_daily_ci_scheduler())

    # Resume any interrupted run after the scheduler is set up
    if resume_case_ids:
        asyncio.create_task(_resume_interrupted_run(resume_case_ids))


async def _resume_interrupted_run(case_ids: list[int]) -> None:
    """Creates a new CI run to finish the cases missed due to a server restart."""
    await asyncio.sleep(5)  # small delay to let the server fully start
    db = db_module.SessionLocal()
    try:
        cases = db.query(CITestCase).filter(CITestCase.id.in_(case_ids)).all()
        if not cases:
            return
        run = CIRun(
            triggered_by="resume-after-restart",
            started_at=datetime.utcnow(),
            total_cases=len(cases),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        print(f"[judge] Resuming {len(cases)} untested cases as CI run #{run.id}.")
    finally:
        db.close()
    await _execute_ci_run(run.id, case_ids)


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _create_admin_token() -> str:
    exp = datetime.utcnow() + timedelta(minutes=JUDGE_JWT_EXPIRE_MINUTES)
    return jwt.encode({"sub": "admin", "exp": exp}, JUDGE_JWT_SECRET, algorithm=JUDGE_JWT_ALG)


def _verify_admin_token(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, JUDGE_JWT_SECRET, algorithms=[JUDGE_JWT_ALG])
        if payload.get("sub") != "admin":
            raise HTTPException(status_code=403, detail="Forbidden")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _verify_internal_key(x_internal_key: str = Header(...)):
    if x_internal_key != JUDGE_INTERNAL_KEY:
        raise HTTPException(status_code=403, detail="Invalid internal key")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _judgment_to_out(j: Judgment) -> JudgmentOut:
    return JudgmentOut(
        id=j.id,
        feature=j.feature,
        user_id=j.user_id,
        source=j.source,
        ci_run_id=j.ci_run_id,
        test_case_id=j.test_case_id,
        test_case_description=j.test_case_description,
        input_data=json.loads(j.input_data),
        output_data=json.loads(j.output_data),
        scores=json.loads(j.scores),
        overall_score=j.overall_score,
        feedback=j.feedback,
        model_used=j.model_used,
        latency_ms=j.latency_ms,
        created_at=j.created_at,
    )


def _ci_run_to_out(run: CIRun, judgments=None) -> CIRunOut:
    return CIRunOut(
        id=run.id,
        triggered_by=run.triggered_by,
        started_at=run.started_at,
        finished_at=run.finished_at,
        total_cases=run.total_cases,
        passed=run.passed,
        failed=run.failed,
        judgments=[_judgment_to_out(j) for j in judgments] if judgments is not None else None,
    )


def _run_judgment(feature: str, input_data: dict, output_data: dict,
                   user_id: int, latency_ms: Optional[int],
                   source: str, ci_run_id: Optional[int],
                   db: Session,
                   test_case_id: Optional[int] = None,
                   test_case_description: Optional[str] = None) -> Judgment:
    from judge_gemini import judge, score_latency, GEMINI_MODEL
    scores, overall, feedback = judge(feature, input_data, output_data)
    if latency_ms is not None:
        scores["latency"] = score_latency(feature, latency_ms)
        overall = round(sum(scores.values()) / len(scores), 2)
    j = Judgment(
        feature=feature,
        user_id=user_id,
        source=source,
        ci_run_id=ci_run_id,
        test_case_id=test_case_id,
        test_case_description=test_case_description,
        input_data=json.dumps(input_data),
        output_data=json.dumps(output_data),
        scores=json.dumps(scores),
        overall_score=overall,
        feedback=feedback,
        model_used=GEMINI_MODEL,
        latency_ms=latency_ms,
        created_at=datetime.utcnow(),
    )
    db.add(j)
    db.commit()
    db.refresh(j)
    return j


async def _run_judgment_for_ci(feature: str, input_data: dict, output_data: dict,
                               user_id: int, latency_ms: Optional[int],
                               ci_run_id: int, db: Session,
                               test_case_id: int,
                               test_case_description: str) -> Judgment:
    from judge_gemini import judge, score_latency, GEMINI_MODEL
    scores, overall, feedback = await run_in_threadpool(judge, feature, input_data, output_data)
    if latency_ms is not None:
        scores["latency"] = score_latency(feature, latency_ms)
        overall = round(sum(scores.values()) / len(scores), 2)
    j = Judgment(
        feature=feature,
        user_id=user_id,
        source="ci",
        ci_run_id=ci_run_id,
        test_case_id=test_case_id,
        test_case_description=test_case_description,
        input_data=json.dumps(input_data),
        output_data=json.dumps(output_data),
        scores=json.dumps(scores),
        overall_score=overall,
        feedback=feedback,
        model_used=GEMINI_MODEL,
        latency_ms=latency_ms,
        created_at=datetime.utcnow(),
    )
    db.add(j)
    db.commit()
    db.refresh(j)
    return j


def _record_ci_failure(feature: str, input_data: dict, error: Exception,
                       ci_run_id: int, db: Session,
                       test_case_id: int,
                       test_case_description: str) -> Judgment:
    from judge_gemini import GEMINI_MODEL, metrics_for_feature

    error_text = str(error) or repr(error)
    scores = {metric: 0.0 for metric in metrics_for_feature(feature)}
    j = Judgment(
        feature=feature,
        user_id=0,
        source="ci",
        ci_run_id=ci_run_id,
        test_case_id=test_case_id,
        test_case_description=test_case_description,
        input_data=json.dumps(input_data),
        output_data=json.dumps({"error": error_text}),
        scores=json.dumps(scores),
        overall_score=0.0,
        feedback=f"CI execution failed before a valid judge score was saved: {error_text}",
        model_used=GEMINI_MODEL,
        latency_ms=None,
        created_at=datetime.utcnow(),
    )
    db.add(j)
    db.commit()
    db.refresh(j)
    return j


def _select_ci_cases(cases: list[CITestCase], case_limit: int) -> list[CITestCase]:
    """Pick a daily suite with a fixed smoke core plus rotating coverage."""
    if len(cases) <= case_limit:
        return cases

    by_feature: dict[str, list[CITestCase]] = {}
    for case in sorted(cases, key=lambda c: c.id):
        by_feature.setdefault(case.feature, []).append(case)

    selected: list[CITestCase] = []
    selected_ids: set[int] = set()
    today_seed = int(os.getenv("JUDGE_CI_ROTATION_DAY", datetime.utcnow().strftime("%Y%m%d")))

    for feature, quota in CI_FEATURE_QUOTAS.items():
        feature_cases = by_feature.get(feature, [])
        core_descriptions = CI_CORE_CASE_DESCRIPTIONS.get(feature, set())
        core_cases = [case for case in feature_cases if case.description in core_descriptions]

        for case in core_cases[:quota]:
            selected.append(case)
            selected_ids.add(case.id)

        remaining_quota = quota - sum(1 for case in selected if case.feature == feature)
        if remaining_quota <= 0:
            continue

        rotating_pool = [case for case in feature_cases if case.id not in selected_ids]
        if rotating_pool:
            offset = (today_seed + sum(ord(ch) for ch in feature)) % len(rotating_pool)
            rotating_pool = rotating_pool[offset:] + rotating_pool[:offset]
            for case in rotating_pool[:remaining_quota]:
                selected.append(case)
                selected_ids.add(case.id)

    if len(selected) < case_limit:
        for case in sorted(cases, key=lambda c: c.id):
            if case.id not in selected_ids:
                selected.append(case)
                selected_ids.add(case.id)
                if len(selected) >= case_limit:
                    break

    return selected[:case_limit]


async def _execute_ci_run(run_id: int, case_ids: list[int]) -> None:
    db = db_module.SessionLocal()
    passed = 0
    failed = 0
    try:
        cases = (
            db.query(CITestCase)
            .filter(CITestCase.id.in_(case_ids))
            .order_by(CITestCase.feature, CITestCase.id)
            .all()
        )
        by_id = {case.id: case for case in cases}
        ordered_cases = [by_id[case_id] for case_id in case_ids if case_id in by_id]

        for case in ordered_cases:
            input_data = json.loads(case.input_data)
            try:
                output_data, latency_ms = await _call_ai_service(case.feature, input_data)
                j = await _run_judgment_for_ci(
                    feature=case.feature,
                    input_data=input_data,
                    output_data=output_data,
                    user_id=0,
                    latency_ms=latency_ms,
                    ci_run_id=run_id,
                    db=db,
                    test_case_id=case.id,
                    test_case_description=case.description,
                )
                if j.overall_score >= PASS_THRESHOLD:
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"[judge/ci] Case {case.id} ({case.feature}) failed: {e}")
                _record_ci_failure(
                    feature=case.feature,
                    input_data=input_data,
                    error=e,
                    ci_run_id=run_id,
                    db=db,
                    test_case_id=case.id,
                    test_case_description=case.description,
                )
                failed += 1

            run = db.query(CIRun).filter(CIRun.id == run_id).first()
            if run:
                run.passed = passed
                run.failed = failed
                db.commit()

        run = db.query(CIRun).filter(CIRun.id == run_id).first()
        if run:
            run.finished_at = datetime.utcnow()
            run.passed = passed
            run.failed = failed
            db.commit()
    except Exception as e:
        print(f"[judge/ci] Run {run_id} failed: {e}")
        run = db.query(CIRun).filter(CIRun.id == run_id).first()
        if run:
            run.finished_at = datetime.utcnow()
            run.failed = run.total_cases
            db.commit()
    finally:
        db.close()


# ── CI service call helpers ───────────────────────────────────────────────────

_CI_SERVICE_MAP = {
    "summary":         (SUMMARY_SERVICE_URL,    "/summarize"),
    "paraphrase":      (PARAPHRASE_SERVICE_URL, "/paraphrase"),
    "counterarguments":(COUNTER_SERVICE_URL,    "/counter"),
    "quiz":            (QUIZ_SERVICE_URL,        "/quizzes/generate"),
    "librarian":       (LIBRARIAN_SERVICE_URL,   "/api/v1/messages"),
    "roadmap_explain": (ROADMAP_SERVICE_URL,     "/explain-concept"),
    "roadmap_graph":   (ROADMAP_SERVICE_URL,     "/extract-concepts-sync"),
}

# For librarian CI we need a dummy user id; use 0 for CI
_LIBRARIAN_CI_USER_ID = "0"


async def _call_ai_service(feature: str, input_data: dict) -> tuple[dict, int]:
    base, path = _CI_SERVICE_MAP[feature]
    url = f"{base.rstrip('/')}{path}"

    headers = {}
    payload = input_data.copy()

    # Librarian needs X-User-Id and a specific shape
    if feature == "librarian":
        headers["X-User-Id"] = _LIBRARIAN_CI_USER_ID
        user_message = input_data.get("user_message", "")
        library_context = input_data.get("library_context_for_judge")
        if library_context:
            user_message = (
                "For this CI evaluation, use the mock library context below as the user's library. "
                "Answer the user's question from this context and say when the requested paper or fact "
                "is not present.\n\n"
                f"Mock library context:\n{library_context}\n\n"
                f"User question:\n{user_message}"
            )
        payload = {"content": user_message, "conversation_id": None}
    elif feature == "roadmap_explain":
        headers["X-User-Id"] = _LIBRARIAN_CI_USER_ID
    elif feature == "roadmap_graph":
        headers["X-Internal-Key"] = os.getenv("JUDGE_INTERNAL_KEY", "changeme-judge")

    import time
    async with httpx.AsyncClient(timeout=180.0) as client:
        t0 = time.monotonic()
        resp = await client.post(url, json=payload, headers=headers)
        latency_ms = int((time.monotonic() - t0) * 1000)

    if resp.status_code >= 400:
        raise RuntimeError(f"AI service {feature} returned {resp.status_code}: {resp.text[:200]}")

    return resp.json(), latency_ms


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"ok": True, "service": "judge"}


@app.post("/admin/login", response_model=TokenOut)
async def admin_login(body: LoginRequest):
    if body.username != JUDGE_ADMIN_USER or body.password != JUDGE_ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenOut(access_token=_create_admin_token())


# Internal endpoint called by the gateway background task
@app.post("/judge/{feature}", status_code=202)
async def receive_judgment(
    feature: str,
    body: JudgeRequest,
    background_tasks: BackgroundTasks,
    x_internal_key: str = Header(...),
    db: Session = Depends(get_db),
):
    _verify_internal_key(x_internal_key=x_internal_key)
    known = {"summary", "paraphrase", "quiz", "counterarguments", "librarian", "roadmap"}
    if feature not in known:
        raise HTTPException(status_code=400, detail=f"Unknown feature: {feature}")

    def _do_judge():
        _db = db_module.SessionLocal()
        try:
            _run_judgment(
                feature=feature,
                input_data=body.input_data,
                output_data=body.output_data,
                user_id=body.user_id,
                latency_ms=body.latency_ms,
                source="live",
                ci_run_id=None,
                db=_db,
            )
        except Exception as e:
            print(f"[judge] Judgment failed for {feature}: {e}")
        finally:
            _db.close()

    background_tasks.add_task(_do_judge)
    return {"accepted": True}


@app.get("/judgments", response_model=JudgmentListOut, dependencies=[Depends(_verify_admin_token)])
async def list_judgments(
    feature: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(Judgment)
    if feature:
        q = q.filter(Judgment.feature == feature)
    if source:
        q = q.filter(Judgment.source == source)
    if from_date:
        q = q.filter(Judgment.created_at >= datetime.fromisoformat(from_date))
    if to_date:
        q = q.filter(Judgment.created_at <= datetime.fromisoformat(to_date))
    total = q.count()
    items = q.order_by(Judgment.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return JudgmentListOut(
        items=[_judgment_to_out(j) for j in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@app.get("/judgments/{judgment_id}", response_model=JudgmentOut, dependencies=[Depends(_verify_admin_token)])
async def get_judgment(judgment_id: int, db: Session = Depends(get_db)):
    j = db.query(Judgment).filter(Judgment.id == judgment_id).first()
    if not j:
        raise HTTPException(status_code=404, detail="Judgment not found")
    return _judgment_to_out(j)


@app.get("/stats", response_model=StatsOut, dependencies=[Depends(_verify_admin_token)])
async def get_stats(db: Session = Depends(get_db)):
    features = ["summary", "paraphrase", "quiz", "counterarguments", "librarian", "roadmap"]
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    result = []
    for feat in features:
        rows = db.query(Judgment).filter(Judgment.feature == feat).all()
        if not rows:
            result.append(FeatureStats(
                feature=feat, avg_overall=0.0, avg_scores={},
                total_judgments=0, last_7d_avg=None, delta_vs_prev_week=None,
            ))
            continue

        # Aggregate per-metric averages
        metric_totals: dict = {}
        metric_counts: dict = {}
        for r in rows:
            for m, v in json.loads(r.scores).items():
                metric_totals[m] = metric_totals.get(m, 0.0) + v
                metric_counts[m] = metric_counts.get(m, 0) + 1
        avg_scores = {m: round(metric_totals[m] / metric_counts[m], 2) for m in metric_totals}
        avg_overall = round(sum(r.overall_score for r in rows) / len(rows), 2)

        # Last 7 days
        recent = [r for r in rows if r.created_at >= week_ago]
        last_7d_avg = round(sum(r.overall_score for r in recent) / len(recent), 2) if recent else None

        # Previous 7-day window for delta
        prev = [r for r in rows if two_weeks_ago <= r.created_at < week_ago]
        prev_avg = round(sum(r.overall_score for r in prev) / len(prev), 2) if prev else None
        delta = round(last_7d_avg - prev_avg, 2) if (last_7d_avg is not None and prev_avg is not None) else None

        result.append(FeatureStats(
            feature=feat,
            avg_overall=avg_overall,
            avg_scores=avg_scores,
            total_judgments=len(rows),
            last_7d_avg=last_7d_avg,
            delta_vs_prev_week=delta,
        ))

    return StatsOut(features=result)


# ── CI Test Cases ─────────────────────────────────────────────────────────────

@app.get("/ci/test-cases", response_model=list[CITestCaseOut], dependencies=[Depends(_verify_admin_token)])
async def list_ci_test_cases(db: Session = Depends(get_db)):
    cases = db.query(CITestCase).order_by(CITestCase.feature, CITestCase.id).all()
    return [
        CITestCaseOut(
            id=c.id, feature=c.feature, description=c.description,
            input_data=json.loads(c.input_data), created_at=c.created_at,
        )
        for c in cases
    ]


@app.post("/ci/test-cases", response_model=CITestCaseOut, dependencies=[Depends(_verify_admin_token)])
async def create_ci_test_case(body: CITestCaseCreate, db: Session = Depends(get_db)):
    known = {"summary", "paraphrase", "quiz", "counterarguments", "librarian", "roadmap"}
    if body.feature not in known:
        raise HTTPException(status_code=400, detail=f"Unknown feature: {body.feature}")
    case = CITestCase(
        feature=body.feature,
        description=body.description,
        input_data=json.dumps(body.input_data),
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return CITestCaseOut(
        id=case.id, feature=case.feature, description=case.description,
        input_data=json.loads(case.input_data), created_at=case.created_at,
    )


@app.delete("/ci/test-cases/{case_id}", status_code=204, dependencies=[Depends(_verify_admin_token)])
async def delete_ci_test_case(case_id: int, db: Session = Depends(get_db)):
    case = db.query(CITestCase).filter(CITestCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Test case not found")
    db.delete(case)
    db.commit()


# ── CI Runs ───────────────────────────────────────────────────────────────────

@app.post("/ci/run", response_model=CIRunOut)
async def run_ci(
    background_tasks: BackgroundTasks,
    x_internal_key: str = Header(...),
    triggered_by: str = Query("manual"),
    case_limit: int = Query(CI_DEFAULT_CASE_LIMIT, ge=1, le=1000),
    wait: bool = Query(False),
    db: Session = Depends(get_db),
):
    _verify_internal_key(x_internal_key=x_internal_key)
    cases = db.query(CITestCase).order_by(CITestCase.feature, CITestCase.id).all()
    if not cases:
        raise HTTPException(status_code=400, detail="No CI test cases found. Seed first.")
    selected_cases = _select_ci_cases(cases, case_limit)

    run = CIRun(
        triggered_by=triggered_by,
        started_at=datetime.utcnow(),
        total_cases=len(selected_cases),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    case_ids = [case.id for case in selected_cases]
    if wait:
        await _execute_ci_run(run.id, case_ids)
        db.refresh(run)
        judgments = db.query(Judgment).filter(Judgment.ci_run_id == run.id).all()
        return _ci_run_to_out(run, judgments)

    background_tasks.add_task(_execute_ci_run, run.id, case_ids)
    return _ci_run_to_out(run, [])


@app.get("/ci/runs", response_model=list[CIRunOut], dependencies=[Depends(_verify_admin_token)])
async def list_ci_runs(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    runs = db.query(CIRun).order_by(CIRun.started_at.desc()).limit(limit).all()
    return [_ci_run_to_out(r) for r in runs]


@app.get("/ci/runs/{run_id}", response_model=CIRunOut, dependencies=[Depends(_verify_admin_token)])
async def get_ci_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(CIRun).filter(CIRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="CI run not found")
    judgments = db.query(Judgment).filter(Judgment.ci_run_id == run_id).all()
    return _ci_run_to_out(run, judgments)
