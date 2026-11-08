import json
import logging
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, func
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

# ── Environment ─────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env", override=True)

# Try to load global backend .env for shared settings
_backend_env = BASE_DIR.parent / ".env"
if _backend_env.exists():
    load_dotenv(dotenv_path=_backend_env, override=False)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
VERTEX_AI_PROJECT = os.getenv("VERTEX_AI_PROJECT", "")
VERTEX_AI_LOCATION = os.getenv("VERTEX_AI_LOCATION", "us-central1")
GEMINI_MODEL = os.getenv("GEMINI_COURSE_MODEL", "gemini-2.5-flash")

LIBRARY_SERVICE_URL = os.getenv("LIBRARY_SERVICE_URL", "http://localhost:8002")
SUMMARY_SERVICE_URL = os.getenv("SUMMARY_SERVICE_URL", "http://localhost:8110")
ROADMAP_SERVICE_URL = os.getenv("ROADMAP_SERVICE_URL", "http://localhost:8130")

# ── Gemini setup ─────────────────────────────────────────────────────────────
_gemini_model = None
_gemini_mode = "none"

def _init_gemini():
    global _gemini_model, _gemini_mode
    if VERTEX_AI_PROJECT and VERTEX_AI_LOCATION:
        try:
            import vertexai
            from vertexai.generative_models import GenerativeModel
            vertexai.init(project=VERTEX_AI_PROJECT, location=VERTEX_AI_LOCATION)
            _gemini_model = GenerativeModel(GEMINI_MODEL)
            _gemini_mode = "vertex"
            logging.getLogger(__name__).info("course_service: using Vertex AI")
            return
        except Exception as e:
            logging.getLogger(__name__).warning(f"Vertex AI init failed: {e}, falling back to Developer API")
    if GEMINI_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=GEMINI_API_KEY)
            _gemini_model = genai.GenerativeModel(GEMINI_MODEL)
            _gemini_mode = "developer"
            logging.getLogger(__name__).info("course_service: using Gemini Developer API")
        except Exception as e:
            logging.getLogger(__name__).error(f"Gemini Developer API init failed: {e}")

_init_gemini()


def _call_gemini(prompt: str, temperature: float = 0.3) -> str:
    if _gemini_model is None:
        raise RuntimeError("Gemini not configured")
    if _gemini_mode == "vertex":
        from vertexai.generative_models import GenerationConfig
        response = _gemini_model.generate_content(
            prompt,
            generation_config=GenerationConfig(temperature=temperature, max_output_tokens=4096),
        )
        return response.text
    else:
        import google.generativeai as genai
        from google.generativeai.types import GenerationConfig
        response = _gemini_model.generate_content(
            prompt,
            generation_config=GenerationConfig(temperature=temperature, max_output_tokens=4096),
        )
        return response.text


# ── Database ──────────────────────────────────────────────────────────────────
DB_PATH = BASE_DIR / "course.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Course(Base):
    __tablename__ = "courses"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    syllabus_text = Column(Text, nullable=True)   # JSON: [{week, topic, paper_titles, section_name}]
    overview = Column(Text, nullable=True)         # AI-generated paragraph
    reading_order = Column(Text, nullable=True)    # JSON: [paper_id, ...]
    status = Column(String(20), default="creating")  # creating | ready | error
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    papers = relationship("CoursePaper", back_populates="course", cascade="all, delete-orphan", order_by="CoursePaper.position")


class CoursePaper(Base):
    __tablename__ = "course_papers"
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    paper_id = Column(Integer, nullable=False)
    paper_title = Column(String(500), nullable=True)
    position = Column(Integer, default=0)
    week_number = Column(Integer, nullable=True)
    section_name = Column(String(200), nullable=True)
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    course = relationship("Course", back_populates="papers")
    __table_args__ = (UniqueConstraint("course_id", "paper_id"),)


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class CoursePaperOut(BaseModel):
    id: int
    paper_id: int
    paper_title: Optional[str]
    position: int
    week_number: Optional[int]
    section_name: Optional[str]
    added_at: datetime

    class Config:
        from_attributes = True


class CourseOut(BaseModel):
    id: int
    owner_id: int
    name: str
    description: Optional[str]
    overview: Optional[str]
    reading_order: Optional[List[int]]
    status: str
    paper_count: int
    created_at: datetime
    updated_at: datetime
    papers: List[CoursePaperOut] = []

    class Config:
        from_attributes = True


class CourseCreate(BaseModel):
    name: str
    description: Optional[str] = None


class CourseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class AddPaperRequest(BaseModel):
    paper_id: int
    paper_title: Optional[str] = None


class CourseProgressOut(BaseModel):
    course_id: int
    total_papers: int
    papers_read: int
    papers_mastered: int
    completion_pct: float


# ── FastAPI app ───────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Course Service", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "service": "course_service"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _course_to_out(course: Course) -> CourseOut:
    reading_order = None
    if course.reading_order:
        try:
            reading_order = json.loads(course.reading_order)
        except Exception:
            pass
    return CourseOut(
        id=course.id,
        owner_id=course.owner_id,
        name=course.name,
        description=course.description,
        overview=course.overview,
        reading_order=reading_order,
        status=course.status,
        paper_count=len(course.papers),
        created_at=course.created_at,
        updated_at=course.updated_at,
        papers=[
            CoursePaperOut(
                id=cp.id,
                paper_id=cp.paper_id,
                paper_title=cp.paper_title,
                position=cp.position,
                week_number=cp.week_number,
                section_name=cp.section_name,
                added_at=cp.added_at,
            )
            for cp in sorted(course.papers, key=lambda x: x.position)
        ],
    )


def _get_course_or_404(course_id: int, user_id: int, db: Session) -> Course:
    course = db.query(Course).filter(Course.id == course_id, Course.owner_id == user_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


async def _fetch_paper_from_library(paper_id: int, user_id: int) -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{LIBRARY_SERVICE_URL}/api/v1/papers/{paper_id}",
                headers={"X-User-Id": str(user_id)},
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning(f"Failed to fetch paper {paper_id}: {e}")
    return None


async def _fetch_all_course_papers(paper_ids: List[int], user_id: int) -> List[dict]:
    papers = []
    async with httpx.AsyncClient(timeout=15.0) as client:
        for pid in paper_ids:
            try:
                resp = await client.get(
                    f"{LIBRARY_SERVICE_URL}/api/v1/papers/{pid}",
                    headers={"X-User-Id": str(user_id)},
                )
                if resp.status_code == 200:
                    papers.append(resp.json())
            except Exception:
                pass
    return papers


# ── Syllabus parsing ──────────────────────────────────────────────────────────

def _extract_text_from_pdf_bytes(content: bytes) -> str:
    try:
        import io
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages[:20])
    except Exception:
        pass
    try:
        import io
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages[:20])
    except Exception:
        return ""


def _parse_syllabus_with_gemini(syllabus_text: str) -> List[dict]:
    if not syllabus_text.strip() or _gemini_model is None:
        return []
    prompt = f"""You are a syllabus parser. Parse this course syllabus and extract its structure.
Return a JSON array (no markdown, no explanation) with this shape:
[
  {{"week_number": 1, "topic_name": "Introduction", "section_name": "Week 1", "paper_titles": ["Paper Title A", "Paper Title B"]}},
  ...
]
Rules:
- week_number: integer (use null if not weekly structured)
- topic_name: the main topic for that week/module
- section_name: label shown in the schedule (e.g. "Week 1", "Module 2", "Part I")
- paper_titles: list of paper/reading titles mentioned for this week (empty list if none)
- Only return the JSON array, nothing else.

SYLLABUS:
{syllabus_text[:4000]}
"""
    try:
        raw = _call_gemini(prompt, temperature=0.1)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r"```[a-z]*\n?", "", raw).strip().rstrip("```").strip()
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"Syllabus parsing failed: {e}")
        return []


def _fuzzy_match_titles(syllabus_titles: List[str], paper_titles: List[str]) -> dict:
    """Match syllabus paper titles to actual paper titles. Returns {paper_index: best_score}"""
    stopwords = {"a", "an", "the", "of", "in", "on", "for", "and", "or", "to", "with", "by"}

    def normalize(t: str) -> set:
        return set(w.lower() for w in re.findall(r'\w+', t) if w.lower() not in stopwords)

    matches = {}
    for i, pt in enumerate(paper_titles):
        pt_words = normalize(pt)
        best_score = 0
        for syl_title in syllabus_titles:
            syl_words = normalize(syl_title)
            if not syl_words:
                continue
            overlap = len(pt_words & syl_words)
            score = overlap / max(len(syl_words), 1)
            if score > best_score:
                best_score = score
        if best_score >= 0.4:
            matches[i] = best_score
    return matches


def _apply_syllabus_to_papers(course: Course, db: Session) -> None:
    """
    Match CoursePapers to syllabus weeks using title fuzzy-matching,
    then assign week_number, section_name, and position based on syllabus order.
    Unmatched papers are appended after syllabus papers, preserving their relative order.
    """
    if not course.syllabus_text:
        return
    try:
        weeks = json.loads(course.syllabus_text)
    except Exception:
        return
    if not weeks:
        return

    course_papers = list(course.papers)
    if not course_papers:
        return

    # Flatten all syllabus titles with their week metadata for matching
    syllabus_entries: List[dict] = []  # [{week_number, topic_name, section_name, title}]
    for week in weeks:
        for title in (week.get("paper_titles") or []):
            syllabus_entries.append({
                "week_number": week.get("week_number"),
                "topic_name": week.get("topic_name", ""),
                "section_name": week.get("section_name", ""),
                "title": title,
            })

    paper_titles = [cp.paper_title or "" for cp in course_papers]
    syl_titles = [e["title"] for e in syllabus_entries]

    stopwords = {"a", "an", "the", "of", "in", "on", "for", "and", "or", "to", "with", "by"}

    def normalize(t: str) -> set:
        return set(w.lower() for w in re.findall(r'\w+', t) if w.lower() not in stopwords)

    # For each CoursePaper, find the best-matching syllabus entry
    matched: dict[int, dict] = {}  # cp_index → syllabus_entry
    for i, pt in enumerate(paper_titles):
        pt_words = normalize(pt)
        best_score, best_entry = 0.0, None
        for entry in syllabus_entries:
            syl_words = normalize(entry["title"])
            if not syl_words:
                continue
            score = len(pt_words & syl_words) / max(len(syl_words), 1)
            if score > best_score:
                best_score, best_entry = score, entry
        if best_score >= 0.4 and best_entry:
            matched[i] = best_entry

    # Build ordered list: syllabus-matched papers first (in syllabus order), then unmatched
    # Group by syllabus entry order (preserve syllabus sequence)
    syl_title_order = {e["title"]: idx for idx, e in enumerate(syllabus_entries)}

    def sort_key(item):
        i, cp = item
        if i in matched:
            entry = matched[i]
            return (0, syl_title_order.get(entry["title"], 999))
        return (1, cp.position)  # unmatched: preserve relative insertion order

    ordered = sorted(enumerate(course_papers), key=sort_key)

    for pos, (i, cp) in enumerate(ordered):
        cp.position = pos
        if i in matched:
            entry = matched[i]
            cp.week_number = entry["week_number"]
            cp.section_name = entry["section_name"] or entry["topic_name"] or None
        # unmatched papers keep their existing week_number/section_name (null)

    db.commit()
    logger.info(
        "apply_syllabus: course %d — %d/%d papers matched to syllabus weeks",
        course.id, len(matched), len(course_papers),
    )


# ── Agentic pipeline (background) ────────────────────────────────────────────

def _run_agentic_pipeline(course_id: int, user_id: int):
    """Run all background AI tasks after papers are uploaded. Runs in a thread."""
    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            return

        paper_ids = [cp.paper_id for cp in course.papers]
        if not paper_ids:
            course.status = "ready"
            db.commit()
            return

        # Fetch paper data from library_service (sync via httpx)
        papers_data = []
        for pid in paper_ids:
            try:
                resp = httpx.get(
                    f"{LIBRARY_SERVICE_URL}/api/v1/papers/{pid}",
                    headers={"X-User-Id": str(user_id)},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    papers_data.append(resp.json())
            except Exception:
                pass

        # 1. Apply syllabus to papers (assign week/section/position via fuzzy matching)
        try:
            _apply_syllabus_to_papers(course, db)
        except Exception as e:
            logger.error(f"Syllabus application failed for course {course_id}: {e}")

        # 2. Generate course overview
        try:
            _generate_overview_sync(course, papers_data, db)
        except Exception as e:
            logger.error(f"Overview generation failed for course {course_id}: {e}")

        # 3. Generate reading order (respects syllabus order if already applied)
        try:
            _generate_reading_order_sync(course, papers_data, db)
        except Exception as e:
            logger.error(f"Reading order generation failed for course {course_id}: {e}")

        # 4. Trigger course roadmap generation in roadmap_service
        try:
            _trigger_course_roadmap(course_id, user_id, paper_ids)
        except Exception as e:
            logger.error(f"Roadmap trigger failed for course {course_id}: {e}")

        # 5. Auto-generate study plan scoped to this course (best-effort)
        try:
            from datetime import date
            httpx.post(
                f"{ROADMAP_SERVICE_URL}/plans/generate",
                json={"hours_per_week": 10, "starts_at": str(date.today()), "course_id": course_id},
                headers={"X-User-Id": str(user_id)},
                timeout=30.0,
            )
        except Exception as e:
            logger.warning(f"Study plan auto-generation failed (non-fatal) for course {course_id}: {e}")

        course.status = "ready"
        db.commit()

    except Exception as e:
        logger.error(f"Agentic pipeline error for course {course_id}: {e}")
        try:
            course = db.query(Course).filter(Course.id == course_id).first()
            if course:
                course.status = "error"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _generate_overview_sync(course: Course, papers_data: List[dict], db: Session):
    if _gemini_model is None or not papers_data:
        return
    summaries = []
    for p in papers_data:
        title = p.get("title", "Untitled")
        summary = p.get("summary", "")[:300]
        summaries.append(f"- {title}: {summary}")

    prompt = f"""You are an academic study assistant. Write a concise, engaging course overview (2-3 paragraphs, ~200 words) for a course named "{course.name}".

The course contains these papers/readings:
{chr(10).join(summaries[:20])}

Write the overview in a way that:
1. Explains what the course is about and its main themes
2. Describes the key concepts a student will learn
3. Highlights why these readings are valuable together

Return only the overview text, no headers or bullet points."""

    overview = _call_gemini(prompt, temperature=0.4)
    course.overview = overview.strip()
    db.commit()


def _generate_reading_order_sync(course: Course, papers_data: List[dict], db: Session):
    if _gemini_model is None or not papers_data:
        return

    # If syllabus already structured papers, respect that order
    if course.syllabus_text:
        try:
            syllabus = json.loads(course.syllabus_text)
            if syllabus:
                # Use syllabus-defined order
                ordered_ids = [cp.paper_id for cp in sorted(course.papers, key=lambda x: x.position)]
                if ordered_ids:
                    course.reading_order = json.dumps(ordered_ids)
                    db.commit()
                    return
        except Exception:
            pass

    if len(papers_data) <= 1:
        course.reading_order = json.dumps([p["id"] for p in papers_data])
        db.commit()
        return

    papers_info = []
    for i, p in enumerate(papers_data):
        papers_info.append(f"{i+1}. [{p.get('id')}] {p.get('title', 'Untitled')} — {p.get('summary', '')[:150]}")

    prompt = f"""You are an academic curriculum designer. Given these papers for a course on "{course.name}", determine the optimal reading order based on concept dependencies (foundational papers first, advanced ones later).

Papers:
{chr(10).join(papers_info[:20])}

Return ONLY a JSON array of paper IDs in the recommended reading order. Example: [3, 1, 4, 2]
No explanation, no markdown, just the JSON array."""

    try:
        raw = _call_gemini(prompt, temperature=0.1)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r"```[a-z]*\n?", "", raw).strip().rstrip("```").strip()
        ordered_ids = json.loads(raw)
        # Validate all IDs exist
        valid_ids = {p["id"] for p in papers_data}
        ordered_ids = [pid for pid in ordered_ids if pid in valid_ids]
        # Append any missing IDs at the end
        for p in papers_data:
            if p["id"] not in ordered_ids:
                ordered_ids.append(p["id"])
        course.reading_order = json.dumps(ordered_ids)
        # Update CoursePaper positions based on reading order
        for pos, pid in enumerate(ordered_ids):
            cp = next((cp for cp in course.papers if cp.paper_id == pid), None)
            if cp:
                cp.position = pos
        db.commit()
    except Exception as e:
        logger.warning(f"Reading order parse failed: {e}")
        # Fall back to insertion order
        course.reading_order = json.dumps([cp.paper_id for cp in course.papers])
        db.commit()


def _trigger_course_roadmap(course_id: int, user_id: int, paper_ids: List[int]):
    try:
        httpx.post(
            f"{ROADMAP_SERVICE_URL}/generate",
            params={"course_id": course_id},
            headers={"X-User-Id": str(user_id)},
            json={"paper_ids": paper_ids},  # matches GenerateRoadmapBody
            timeout=10.0,
        )
    except Exception as e:
        logger.warning(f"Could not trigger roadmap for course {course_id}: {e}")


# ── Course CRUD ────────────────────────────────────────────────────────────────

@app.post("/courses", status_code=201)
async def create_course(
    name: str = Form(...),
    description: str = Form(None),
    syllabus_file: Optional[UploadFile] = File(None),
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        course = Course(
            owner_id=x_user_id,
            name=name.strip(),
            description=(description or "").strip() or None,
            status="creating",
        )

        if syllabus_file and syllabus_file.filename:
            content = await syllabus_file.read()
            syllabus_text = _extract_text_from_pdf_bytes(content)
            if syllabus_text.strip():
                weeks = _parse_syllabus_with_gemini(syllabus_text)
                if weeks:
                    course.syllabus_text = json.dumps(weeks)

        db.add(course)
        db.commit()
        db.refresh(course)
        return _course_to_out(course)
    finally:
        db.close()


@app.get("/courses", response_model=List[CourseOut])
def list_courses(
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        courses = (
            db.query(Course)
            .filter(Course.owner_id == x_user_id)
            .order_by(Course.created_at.desc())
            .all()
        )
        return [_course_to_out(c) for c in courses]
    finally:
        db.close()


@app.get("/courses/{course_id}", response_model=CourseOut)
def get_course(
    course_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        course = _get_course_or_404(course_id, x_user_id, db)
        return _course_to_out(course)
    finally:
        db.close()


@app.put("/courses/{course_id}", response_model=CourseOut)
def update_course(
    course_id: int,
    data: CourseUpdate,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        course = _get_course_or_404(course_id, x_user_id, db)
        if data.name is not None:
            course.name = data.name.strip()
        if data.description is not None:
            course.description = data.description.strip() or None
        course.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(course)
        return _course_to_out(course)
    finally:
        db.close()


@app.delete("/courses/{course_id}")
def delete_course(
    course_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        course = _get_course_or_404(course_id, x_user_id, db)
        db.delete(course)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── Paper membership ──────────────────────────────────────────────────────────

@app.post("/courses/{course_id}/papers", status_code=201)
async def add_paper_to_course(
    course_id: int,
    data: AddPaperRequest,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        course = _get_course_or_404(course_id, x_user_id, db)

        existing = db.query(CoursePaper).filter(
            CoursePaper.course_id == course_id,
            CoursePaper.paper_id == data.paper_id,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Paper already in course")

        # Fetch title from library if not provided
        title = data.paper_title
        if not title:
            paper = await _fetch_paper_from_library(data.paper_id, x_user_id)
            title = paper.get("title") if paper else None

        max_pos = db.query(func.max(CoursePaper.position)).filter(
            CoursePaper.course_id == course_id
        ).scalar() or -1

        cp = CoursePaper(
            course_id=course_id,
            paper_id=data.paper_id,
            paper_title=title,
            position=max_pos + 1,
        )
        db.add(cp)
        db.commit()
        db.refresh(cp)

        # Re-run the agentic pipeline so reading order, syllabus assignment,
        # overview, and study plan are kept up-to-date after each paper addition.
        thread = threading.Thread(
            target=_run_agentic_pipeline,
            args=(course_id, x_user_id),
            daemon=True,
        )
        thread.start()

        return {"ok": True, "paper_id": cp.paper_id, "position": cp.position}
    finally:
        db.close()


@app.delete("/courses/{course_id}/papers/{paper_id}")
def remove_paper_from_course(
    course_id: int,
    paper_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        _get_course_or_404(course_id, x_user_id, db)
        cp = db.query(CoursePaper).filter(
            CoursePaper.course_id == course_id,
            CoursePaper.paper_id == paper_id,
        ).first()
        if not cp:
            raise HTTPException(status_code=404, detail="Paper not in course")
        db.delete(cp)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── Bulk PDF upload ───────────────────────────────────────────────────────────

@app.post("/courses/{course_id}/upload-bulk")
async def upload_bulk(
    course_id: int,
    files: List[UploadFile] = File(...),
    background_tasks: BackgroundTasks = None,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        course = _get_course_or_404(course_id, x_user_id, db)
        results = []

        for file in files:
            try:
                content = await file.read()
                async with httpx.AsyncClient(timeout=120.0) as client:
                    resp = await client.post(
                        f"{LIBRARY_SERVICE_URL}/api/v1/papers/upload",
                        files={"file": (file.filename, content, file.content_type or "application/pdf")},
                        headers={"X-User-Id": str(x_user_id)},
                    )
                if resp.status_code in (200, 201):
                    paper = resp.json()
                    paper_id = paper.get("id")
                    title = paper.get("title", file.filename)

                    existing = db.query(CoursePaper).filter(
                        CoursePaper.course_id == course_id,
                        CoursePaper.paper_id == paper_id,
                    ).first()

                    if not existing:
                        max_pos = db.query(func.max(CoursePaper.position)).filter(
                            CoursePaper.course_id == course_id
                        ).scalar() or -1
                        cp = CoursePaper(
                            course_id=course_id,
                            paper_id=paper_id,
                            paper_title=title,
                            position=max_pos + 1,
                        )
                        db.add(cp)
                        db.commit()

                    results.append({"filename": file.filename, "paper_id": paper_id, "title": title, "status": "ok"})
                else:
                    results.append({"filename": file.filename, "status": "error", "detail": resp.text[:200]})
            except Exception as e:
                results.append({"filename": file.filename, "status": "error", "detail": str(e)[:200]})

        db.refresh(course)

        # Kick off agentic pipeline in background thread
        thread = threading.Thread(
            target=_run_agentic_pipeline,
            args=(course_id, x_user_id),
            daemon=True,
        )
        thread.start()

        return {"ok": True, "results": results, "total": len(results)}
    finally:
        db.close()


# ── Course progress ───────────────────────────────────────────────────────────

@app.get("/courses/{course_id}/progress")
async def get_course_progress(
    course_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        course = _get_course_or_404(course_id, x_user_id, db)
        paper_ids = [cp.paper_id for cp in course.papers]
        total = len(paper_ids)
        if not paper_ids:
            return CourseProgressOut(
                course_id=course_id, total_papers=0, papers_read=0,
                papers_mastered=0, completion_pct=0.0
            )

        ids_str = ",".join(str(pid) for pid in paper_ids)
        papers_read = 0
        papers_mastered = 0
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{ROADMAP_SERVICE_URL}/mastery-batch",
                    params={"paper_ids": ids_str},
                    headers={"X-User-Id": str(x_user_id)},
                )
                if resp.status_code == 200:
                    mastery_data = resp.json()
                    for pid in paper_ids:
                        m = mastery_data.get(str(pid), {})
                        state = m.get("mastery_state", 1)
                        if state >= 2:
                            papers_read += 1
                        if m.get("is_mastered"):
                            papers_mastered += 1
        except Exception as e:
            logger.warning(f"Could not fetch mastery batch: {e}")

        pct = round((papers_mastered / total) * 100, 1) if total else 0.0
        return CourseProgressOut(
            course_id=course_id,
            total_papers=total,
            papers_read=papers_read,
            papers_mastered=papers_mastered,
            completion_pct=pct,
        )
    finally:
        db.close()


# ── Aggregated highlights & notes ─────────────────────────────────────────────

@app.get("/courses/{course_id}/highlights")
async def get_course_highlights(
    course_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        course = _get_course_or_404(course_id, x_user_id, db)
        paper_ids = [cp.paper_id for cp in course.papers]
        if not paper_ids:
            return []

        ids_str = ",".join(str(pid) for pid in paper_ids)
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{LIBRARY_SERVICE_URL}/api/v1/highlights",
                    params={"paper_ids": ids_str},
                    headers={"X-User-Id": str(x_user_id)},
                )
                if resp.status_code == 200:
                    return resp.json()
        except Exception as e:
            logger.warning(f"Could not fetch highlights: {e}")
        return []
    finally:
        db.close()


@app.get("/courses/{course_id}/notes")
async def get_course_notes(
    course_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        course = _get_course_or_404(course_id, x_user_id, db)
        paper_ids = [cp.paper_id for cp in course.papers]
        if not paper_ids:
            return []

        ids_str = ",".join(str(pid) for pid in paper_ids)
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{LIBRARY_SERVICE_URL}/api/v1/notes",
                    params={"paper_ids": ids_str},
                    headers={"X-User-Id": str(x_user_id)},
                )
                if resp.status_code == 200:
                    return resp.json()
        except Exception as e:
            logger.warning(f"Could not fetch notes: {e}")
        return []
    finally:
        db.close()


# ── AI generation endpoints ───────────────────────────────────────────────────

@app.post("/courses/{course_id}/generate-overview")
async def generate_overview(
    course_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        course = _get_course_or_404(course_id, x_user_id, db)
        paper_ids = [cp.paper_id for cp in course.papers]
        papers_data = await _fetch_all_course_papers(paper_ids, x_user_id)
        _generate_overview_sync(course, papers_data, db)
        return {"ok": True, "overview": course.overview}
    finally:
        db.close()


@app.post("/courses/{course_id}/generate-order")
async def generate_reading_order(
    course_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        course = _get_course_or_404(course_id, x_user_id, db)
        paper_ids = [cp.paper_id for cp in course.papers]
        papers_data = await _fetch_all_course_papers(paper_ids, x_user_id)
        _generate_reading_order_sync(course, papers_data, db)
        reading_order = json.loads(course.reading_order) if course.reading_order else []
        return {"ok": True, "reading_order": reading_order}
    finally:
        db.close()


# ── Roadmap forwarding ────────────────────────────────────────────────────────

@app.get("/courses/{course_id}/roadmap")
async def get_course_roadmap(
    course_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        _get_course_or_404(course_id, x_user_id, db)
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{ROADMAP_SERVICE_URL}/",
                params={"course_id": course_id},
                headers={"X-User-Id": str(x_user_id)},
            )
            return resp.json() if resp.status_code == 200 else {"status": "error", "nodes": [], "edges": []}
    finally:
        db.close()


@app.post("/courses/{course_id}/roadmap/generate")
async def generate_course_roadmap(
    course_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        course = _get_course_or_404(course_id, x_user_id, db)
        paper_ids = [cp.paper_id for cp in course.papers]
        _trigger_course_roadmap(course_id, x_user_id, paper_ids)
        return {"ok": True, "message": "Roadmap generation triggered"}
    finally:
        db.close()


# ── Study plan forwarding ─────────────────────────────────────────────────────

@app.get("/courses/{course_id}/study-plan")
async def get_course_study_plan(
    course_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        _get_course_or_404(course_id, x_user_id, db)
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{ROADMAP_SERVICE_URL}/plans/active",
                params={"course_id": course_id},
                headers={"X-User-Id": str(x_user_id)},
            )
            if resp.status_code == 200:
                return resp.json()
            return None
    finally:
        db.close()


@app.post("/courses/{course_id}/study-plan/generate")
async def generate_course_study_plan(
    course_id: int,
    hours_per_week: int = 10,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    db = SessionLocal()
    try:
        _get_course_or_404(course_id, x_user_id, db)
        from datetime import date
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{ROADMAP_SERVICE_URL}/plans/generate",
                json={"hours_per_week": hours_per_week, "starts_at": str(date.today()), "course_id": course_id},
                headers={"X-User-Id": str(x_user_id)},
            )
            if resp.status_code == 200:
                return resp.json()
            return {"ok": False, "detail": resp.text[:200]}
    finally:
        db.close()


# ── Manual pipeline re-run ────────────────────────────────────────────────────

@app.post("/courses/{course_id}/regenerate")
def regenerate_course(
    course_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    """Re-run the full agentic pipeline (syllabus matching, reading order, overview, study plan)."""
    db = SessionLocal()
    try:
        course = _get_course_or_404(course_id, x_user_id, db)
        course.status = "creating"
        db.commit()
    finally:
        db.close()

    thread = threading.Thread(
        target=_run_agentic_pipeline,
        args=(course_id, x_user_id),
        daemon=True,
    )
    thread.start()
    return {"ok": True, "message": "Pipeline triggered — poll GET /courses/{id} for status"}


# ── Course paper list (with full paper details) ────────────────────────────────

@app.get("/courses/{course_id}/papers-full")
async def get_course_papers_full(
    course_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
):
    """Returns full paper data from library_service for all papers in course."""
    db = SessionLocal()
    try:
        course = _get_course_or_404(course_id, x_user_id, db)
        ordered_cp = sorted(course.papers, key=lambda x: x.position)
        paper_ids = [cp.paper_id for cp in ordered_cp]
        papers_data = await _fetch_all_course_papers(paper_ids, x_user_id)

        # Index by id
        papers_by_id = {p["id"]: p for p in papers_data}

        result = []
        for cp in ordered_cp:
            paper = papers_by_id.get(cp.paper_id)
            if paper:
                paper["course_position"] = cp.position
                paper["week_number"] = cp.week_number
                paper["section_name"] = cp.section_name
                result.append(paper)

        return result
    finally:
        db.close()
