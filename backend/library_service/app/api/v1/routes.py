import asyncio
import json
import logging
import os
import re
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ...db.session import get_db
from ...db.models.paper import Paper
from ...db.models.highlight import Highlight, HighlightGroupTitle, HighlightColorSummary
from ...db.models.note import Note, NotesPaperSummary
from ...schemas.paper import PaperOut, PaperCreate, PaperUpdate, SearchFilters
from ...schemas.highlight import (
    HighlightCreate,
    HighlightOut,
    HighlightGroup,
    HighlightGroupTitleOut,
    HighlightGroupTitleWithPaperOut,
    HighlightColorSummaryOut,
)
from ...schemas.note import NoteCreate, NoteOut, NotesPaperSummaryOut
from ...core.config import settings
from ...services.pdf_extractor import extract_text_from_pdf
from ...services.document_structured import structure_document, extract_authors_fallback

router = APIRouter(tags=["papers"])
logger = logging.getLogger(__name__)


def _paper_to_out(paper: Paper) -> PaperOut:
    return PaperOut(
        id=paper.id,
        title=paper.title,
        authors=json.loads(paper.authors) if paper.authors else [],
        publication_year=paper.publication_year,
        subject=paper.subject,
        summary=paper.summary,
        full_text=paper.full_text,
        created_at=paper.created_at,
        structured_content=getattr(paper, "structured_content", None),
    )


def _owner_filter(query, x_user_id: int):
    """Restrict to papers in the user's library: owned by user or legacy (owner_id is null)."""
    return query.filter(or_(Paper.owner_id.is_(None), Paper.owner_id == x_user_id))


def _can_access(paper: Paper, x_user_id: int) -> bool:
    return paper.owner_id is None or paper.owner_id == x_user_id


def _note_to_out(note: Note, paper_title: str | None = None) -> NoteOut:
    return NoteOut(
        id=note.id,
        user_id=note.user_id,
        paper_id=note.paper_id,
        paper_title=paper_title,
        content=note.content,
        selected_text=note.selected_text,
        start_offset=note.start_offset,
        end_offset=note.end_offset,
        paragraph_index=note.paragraph_index,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.get("/papers", response_model=List[PaperOut])
def get_papers(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    query = _owner_filter(db.query(Paper), x_user_id)
    papers = query.order_by(Paper.created_at.desc()).offset(skip).limit(limit).all()
    result = [_paper_to_out(p) for p in papers]
    return result


@router.post("/papers", response_model=PaperOut)
def create_paper(
    paper: PaperCreate,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    db_paper = Paper(
        owner_id=x_user_id,
        title=paper.title,
        authors=json.dumps(paper.authors),
        publication_year=paper.publication_year,
        subject=paper.subject,
        summary=paper.summary,
        full_text=paper.full_text,
    )
    db.add(db_paper)
    db.commit()
    db.refresh(db_paper)
    return _paper_to_out(db_paper)


# IMPORTANT: These specific routes must come BEFORE /papers/{paper_id} to avoid route conflicts
@router.get("/papers/search", response_model=List[PaperOut])
def search_papers(
    q: str = Query("", description="Search query"),
    subject: str | None = Query(None),
    author: str | None = Query(None),
    start_year: int | None = Query(None),
    end_year: int | None = Query(None),
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    query = _owner_filter(db.query(Paper), x_user_id)
    
    # Search in title, summary, full_text, AND authors
    if q:
        search_term = f"%{q}%"
        # Search in title, summary, full_text, and authors JSON string
        query = query.filter(
            (Paper.title.ilike(search_term)) |
            (Paper.summary.ilike(search_term)) |
            (Paper.full_text.ilike(search_term)) |
            (Paper.authors.ilike(search_term))  # Also search in authors JSON string
        )
    
    # Filter by subject (exact match)
    if subject:
        query = query.filter(Paper.subject == subject)
    
    # Filter by author (search in JSON array of authors)
    if author:
        # Since authors is stored as JSON string like ["Author1", "Author2"],
        # we search case-insensitively in the JSON string
        # This will match if any author name contains the search term
        query = query.filter(Paper.authors.ilike(f"%{author}%"))
    
    # Filter by year range
    if start_year:
        query = query.filter(Paper.publication_year >= start_year)
    
    if end_year:
        query = query.filter(Paper.publication_year <= end_year)
    
    papers = query.order_by(Paper.publication_year.desc(), Paper.title).all()
    return [_paper_to_out(p) for p in papers]


@router.get("/papers/recommendations", response_model=List[PaperOut])
def get_recommendations(
    limit: int = Query(3, ge=1, le=10),
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    import random
    query = _owner_filter(db.query(Paper), x_user_id)
    papers = query.all()
    if len(papers) <= limit:
        selected = papers
    else:
        selected = random.sample(papers, limit)
    return [_paper_to_out(p) for p in selected]


def _year_from_date_string(published_date: str) -> int:
    """Extract 4-digit year from published_date string; default to current year."""
    if not published_date:
        return 0
    match = re.search(r"\b(19|20)\d{2}\b", published_date)
    return int(match.group(0)) if match else 0


# PDF ingestion pipeline: upload -> extract -> structure -> store (must be before /papers/{paper_id})
@router.post("/papers/upload", response_model=PaperOut)
async def upload_pdf(
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
    file: UploadFile = File(..., description="PDF file"),
):
    """Stage 1: Extract text from PDF. Stage 2: Structure via Gemini. Store raw + structured."""
    try:
        pdf_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e!s}")
    size_mb = len(pdf_bytes) / (1024 * 1024)
    if size_mb > settings.INGESTION_FILE_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {settings.INGESTION_FILE_SIZE_MB} MB.",
        )
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted for upload.")
    page_limit = getattr(settings, "INGESTION_PAGE_LIMIT", 50)

    # Stage 1: PDF text extraction (OCR + figure fallback) — run in thread pool so
    # PyMuPDF rendering and Gemini Vision calls don't block the async event loop.
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(extract_text_from_pdf, pdf_bytes, page_limit),
            timeout=300.0,  # 5 min hard cap; most PDFs finish in <60s
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="PDF processing timed out. Try a shorter document or a digital (non-scanned) PDF.",
        )
    raw_text = result.raw_text
    logger.info(
        "upload_pdf: extraction quality=%s chars=%d figures=%d",
        result.extraction_quality, len(raw_text or ""), result.figure_count,
    )
    if not raw_text or len(raw_text.strip()) < 50:
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not extract enough text from the PDF. "
                "The file may be a scanned document with no readable content, "
                "or the OCR step failed. Try a higher-quality scan or a digital PDF."
            ),
        )

    # Stage 2: Structured document extraction (Gemini) — also off the event loop
    structured = await asyncio.to_thread(structure_document, raw_text, result.doc_type)  # positional ok: (text, doc_type)
    if structured:
        title = structured.title or (file.filename or "Untitled").replace(".pdf", "")
        authors = structured.authors or []
        if not authors and raw_text:
            authors = extract_authors_fallback(raw_text)
        year = _year_from_date_string(structured.published_date) or 0
        if not year:
            import datetime
            year = datetime.datetime.now().year
        subject = structured.subject or "General"
        # Summary = abstract only (no metadata or body mixed in)
        summary = structured.abstract or ""
        # Full text = body only (sections or clean_full_text), not title/author/abstract repeated
        full_text = structured.body_only() or structured.to_flat_text() or raw_text
        structured_json = json.dumps(
            structured.model_dump() if hasattr(structured, "model_dump") else structured.dict()
        )
        logger.info("upload_pdf: Gemini structured saved; summary_len=%s full_text_len=%s", len(summary), len(full_text))
    else:
        # Fallback when Gemini unavailable or failed: store raw with minimal metadata
        logger.warning("upload_pdf: Gemini not used or failed; storing raw extraction only")
        title = (file.filename or "Untitled").replace(".pdf", "")
        authors = extract_authors_fallback(raw_text) if raw_text else []
        year = 0
        subject = "Uploaded"
        summary = raw_text[:500] + ("…" if len(raw_text) > 500 else "")
        full_text = raw_text
        structured_json = None

    db_paper = Paper(
        owner_id=x_user_id,
        title=title[:500],
        authors=json.dumps(authors),
        publication_year=year,
        subject=subject[:255],
        summary=summary,
        full_text=full_text,
        raw_extracted_text=raw_text,
        structured_content=structured_json,
    )
    try:
        db.add(db_paper)
        db.commit()
        db.refresh(db_paper)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save paper: {e!s}")

    return _paper_to_out(db_paper)


# Paper by ID route - must come AFTER specific routes like /search and /recommendations
@router.get("/papers/{paper_id}/word-count")
def get_paper_word_count(
    paper_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper or not _can_access(paper, x_user_id):
        raise HTTPException(status_code=404, detail="Paper not found")
    return {"word_count": len((paper.full_text or "").split())}


@router.get("/papers/{paper_id}", response_model=PaperOut)
def get_paper(
    paper_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper or not _can_access(paper, x_user_id):
        raise HTTPException(status_code=404, detail="Paper not found")
    return _paper_to_out(paper)


@router.put("/papers/{paper_id}", response_model=PaperOut)
def update_paper(
    paper_id: int,
    paper_update: PaperUpdate,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    db_paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not db_paper or not _can_access(db_paper, x_user_id):
        raise HTTPException(status_code=404, detail="Paper not found")
    if db_paper.owner_id is None:
        raise HTTPException(status_code=403, detail="Legacy papers cannot be edited")
    
    if paper_update.title is not None:
        db_paper.title = paper_update.title
    if paper_update.authors is not None:
        db_paper.authors = json.dumps(paper_update.authors)
    if paper_update.publication_year is not None:
        db_paper.publication_year = paper_update.publication_year
    if paper_update.subject is not None:
        db_paper.subject = paper_update.subject
    if paper_update.summary is not None:
        db_paper.summary = paper_update.summary
    if paper_update.full_text is not None:
        db_paper.full_text = paper_update.full_text
        
    db.commit()
    db.refresh(db_paper)
    return _paper_to_out(db_paper)


@router.delete("/papers/{paper_id}")
def delete_paper(
    paper_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    db_paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not db_paper or not _can_access(db_paper, x_user_id):
        raise HTTPException(status_code=404, detail="Paper not found")
    if db_paper.owner_id is None:
        raise HTTPException(status_code=403, detail="Legacy papers cannot be deleted")
    db.delete(db_paper)
    db.commit()
    return {"status": "success", "message": "Paper deleted"}


@router.get("/categories", response_model=List[str])
def get_categories(
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    query = _owner_filter(db.query(Paper), x_user_id)
    categories = query.with_entities(Paper.subject).distinct().all()
    return [c[0] for c in categories if c[0]]


# Highlights endpoints
@router.post("/highlights", response_model=HighlightOut, status_code=201)
def create_highlight(
    highlight: HighlightCreate,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    
    # Verify paper exists and user can access it (their library or legacy)
    paper = db.query(Paper).filter(Paper.id == highlight.paper_id).first()
    if not paper or not _can_access(paper, x_user_id):
        raise HTTPException(status_code=404, detail="Paper not found")
    
    # Validate color
    valid_colors = ["yellow", "green", "blue", "pink", "orange", "purple", "teal", "red", "cyan", "lime"]
    if highlight.color not in valid_colors:
        raise HTTPException(status_code=400, detail=f"Invalid color. Must be one of: {', '.join(valid_colors)}")
    
    db_highlight = Highlight(
        user_id=x_user_id,
        paper_id=highlight.paper_id,
        color=highlight.color,
        highlighted_text=highlight.highlighted_text,
        start_offset=highlight.start_offset,
        end_offset=highlight.end_offset,
        context_before=highlight.context_before,
        context_after=highlight.context_after
    )
    db.add(db_highlight)
    db.commit()
    db.refresh(db_highlight)
    
    return HighlightOut(
        id=db_highlight.id,
        user_id=db_highlight.user_id,
        paper_id=db_highlight.paper_id,
        paper_title=paper.title,
        color=db_highlight.color,
        highlighted_text=db_highlight.highlighted_text,
        start_offset=db_highlight.start_offset,
        end_offset=db_highlight.end_offset,
        context_before=db_highlight.context_before,
        context_after=db_highlight.context_after,
        created_at=db_highlight.created_at
    )


@router.get("/highlights", response_model=List[HighlightOut])
def get_user_highlights(
    paper_id: Optional[int] = Query(None),
    paper_ids: Optional[str] = Query(None, description="Comma-separated paper IDs for course-level aggregation"),
    color: Optional[str] = Query(None),
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    query = db.query(Highlight).filter(Highlight.user_id == x_user_id)

    if paper_ids:
        try:
            id_list = [int(x.strip()) for x in paper_ids.split(",") if x.strip()]
            if id_list:
                query = query.filter(Highlight.paper_id.in_(id_list))
        except ValueError:
            pass
    elif paper_id:
        query = query.filter(Highlight.paper_id == paper_id)

    if color:
        query = query.filter(Highlight.color == color)
    
    highlights = query.order_by(Highlight.created_at.desc()).all()
    
    result = []
    for h in highlights:
        paper = db.query(Paper).filter(Paper.id == h.paper_id).first()
        result.append(HighlightOut(
            id=h.id,
            user_id=h.user_id,
            paper_id=h.paper_id,
            paper_title=paper.title if paper else None,
            color=h.color,
            highlighted_text=h.highlighted_text,
            start_offset=h.start_offset,
            end_offset=h.end_offset,
            context_before=h.context_before,
            context_after=h.context_after,
            created_at=h.created_at
        ))
    
    return result


@router.get("/highlights/grouped", response_model=List[HighlightGroup])
def get_highlights_grouped_by_color(
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    highlights = db.query(Highlight).filter(Highlight.user_id == x_user_id).order_by(Highlight.created_at.desc()).all()
    
    # Group by color
    color_groups: dict[str, list[HighlightOut]] = {}
    paper_cache = {}
    
    for h in highlights:
        if h.paper_id not in paper_cache:
            paper = db.query(Paper).filter(Paper.id == h.paper_id).first()
            paper_cache[h.paper_id] = paper.title if paper else None
        
        if h.color not in color_groups:
            color_groups[h.color] = []
        
        color_groups[h.color].append(HighlightOut(
            id=h.id,
            user_id=h.user_id,
            paper_id=h.paper_id,
            paper_title=paper_cache[h.paper_id],
            color=h.color,
            highlighted_text=h.highlighted_text,
            start_offset=h.start_offset,
            end_offset=h.end_offset,
            context_before=h.context_before,
            context_after=h.context_after,
            created_at=h.created_at
        ))
    
    # Convert to list of HighlightGroup
    result = [
        HighlightGroup(color=color, highlights=highlights_list)
        for color, highlights_list in color_groups.items()
    ]
    
    # Sort by color order
    color_order = ["yellow", "green", "blue", "pink", "orange", "purple", "teal", "red", "cyan", "lime"]
    result.sort(key=lambda x: color_order.index(x.color) if x.color in color_order else 999)
    
    return result


@router.delete("/highlights/{highlight_id}")
def delete_highlight(
    highlight_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db)
):
    highlight = db.query(Highlight).filter(
        Highlight.id == highlight_id,
        Highlight.user_id == x_user_id
    ).first()

    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found")

    db.delete(highlight)
    db.commit()
    return {"status": "success", "message": "Highlight deleted"}


@router.post("/notes", response_model=NoteOut, status_code=201)
def create_note(
    note: NoteCreate,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    paper = db.query(Paper).filter(Paper.id == note.paper_id).first()
    if not paper or not _can_access(paper, x_user_id):
        raise HTTPException(status_code=404, detail="Paper not found")

    if not (note.content or "").strip():
        raise HTTPException(status_code=400, detail="Note content is required")

    db_note = Note(
        user_id=x_user_id,
        paper_id=note.paper_id,
        content=note.content.strip(),
        selected_text=(note.selected_text or "").strip() or None,
        start_offset=note.start_offset,
        end_offset=note.end_offset,
        paragraph_index=note.paragraph_index,
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return _note_to_out(db_note, paper.title)


@router.get("/notes", response_model=List[NoteOut])
def get_user_notes(
    paper_id: Optional[int] = Query(None),
    paper_ids: Optional[str] = Query(None, description="Comma-separated paper IDs for course-level aggregation"),
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    query = db.query(Note).filter(Note.user_id == x_user_id)
    if paper_ids:
        try:
            id_list = [int(x.strip()) for x in paper_ids.split(",") if x.strip()]
            if id_list:
                query = query.filter(Note.paper_id.in_(id_list))
        except ValueError:
            pass
    elif paper_id:
        query = query.filter(Note.paper_id == paper_id)

    notes = query.order_by(Note.updated_at.desc(), Note.created_at.desc()).all()
    paper_ids = {note.paper_id for note in notes}
    paper_titles = {
        paper.id: paper.title
        for paper in db.query(Paper).filter(Paper.id.in_(paper_ids)).all()
    } if paper_ids else {}
    return [_note_to_out(note, paper_titles.get(note.paper_id)) for note in notes]


@router.delete("/notes/{note_id}")
def delete_note(
    note_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == x_user_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    db.delete(note)
    db.commit()
    return {"status": "success", "message": "Note deleted"}


# ── Highlight group titles (cached AI labels shown in PaperDetail side panel) ──

SUMMARY_SERVICE_URL = os.getenv("SUMMARY_SERVICE_URL", "http://localhost:8110")


def _active_colors_for_paper(db: Session, user_id: int, paper_id: int) -> list[str]:
    rows = (
        db.query(Highlight.color)
        .filter(Highlight.user_id == user_id, Highlight.paper_id == paper_id)
        .distinct()
        .all()
    )
    return [r[0] for r in rows]


def _prune_orphan_titles(db: Session, user_id: int, paper_id: int, active_colors: list[str]) -> None:
    """Remove cached titles for colors that no longer have any highlights in this paper."""
    q = db.query(HighlightGroupTitle).filter(
        HighlightGroupTitle.user_id == user_id,
        HighlightGroupTitle.paper_id == paper_id,
    )
    if active_colors:
        q = q.filter(~HighlightGroupTitle.color.in_(active_colors))
    q.delete(synchronize_session=False)
    db.commit()


def _active_title_keys_for_user(db: Session, user_id: int) -> set[tuple[int, str]]:
    rows = (
        db.query(Highlight.paper_id, Highlight.color)
        .filter(Highlight.user_id == user_id)
        .distinct()
        .all()
    )
    return {(paper_id, color) for paper_id, color in rows}


def _prune_orphan_titles_for_user(db: Session, user_id: int, active_keys: set[tuple[int, str]]) -> None:
    rows = db.query(HighlightGroupTitle).filter(HighlightGroupTitle.user_id == user_id).all()
    stale_rows = [row for row in rows if (row.paper_id, row.color) not in active_keys]
    if not stale_rows:
        return
    for row in stale_rows:
        db.delete(row)
    db.commit()


@router.get("/highlights/titles", response_model=List[HighlightGroupTitleOut])
def get_highlight_group_titles(
    paper_id: int = Query(..., description="Paper ID to fetch cached titles for"),
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    """
    Return cached group titles for the (user, paper). Only returns rows whose color
    still has highlights; orphan rows (color emptied after highlight deletions) are
    pruned automatically.
    """
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper or not _can_access(paper, x_user_id):
        raise HTTPException(status_code=404, detail="Paper not found")

    active_colors = _active_colors_for_paper(db, x_user_id, paper_id)
    _prune_orphan_titles(db, x_user_id, paper_id, active_colors)

    if not active_colors:
        return []

    rows = (
        db.query(HighlightGroupTitle)
        .filter(
            HighlightGroupTitle.user_id == x_user_id,
            HighlightGroupTitle.paper_id == paper_id,
            HighlightGroupTitle.color.in_(active_colors),
        )
        .all()
    )
    return rows


@router.get("/highlights/titles/all", response_model=List[HighlightGroupTitleWithPaperOut])
def get_all_highlight_group_titles(
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    """
    Return cached group titles across the user's full library. Orphan rows are pruned
    if their (paper, color) group no longer has any highlights.
    """
    active_keys = _active_title_keys_for_user(db, x_user_id)
    _prune_orphan_titles_for_user(db, x_user_id, active_keys)

    if not active_keys:
        return []

    rows = (
        db.query(HighlightGroupTitle)
        .filter(HighlightGroupTitle.user_id == x_user_id)
        .all()
    )
    return [row for row in rows if (row.paper_id, row.color) in active_keys]


def _generate_title_via_summary_service(bullets: str) -> Optional[str]:
    """Call summary_service to get a concise group title. Returns None on failure."""
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                f"{SUMMARY_SERVICE_URL}/summarize",
                json={"text": bullets, "size": "small"},
            )
            if resp.status_code != 200:
                logger.warning("summary_service returned %s for title generation", resp.status_code)
                return None
            data = resp.json()
            title = _normalize_generated_title((data.get("summary") or "").strip())
            if not title:
                return None
            # Trim to 160 chars to match DB column
            return title[:160]
    except Exception as e:
        logger.warning("Failed to call summary_service for title: %s", e)
        return None


def _normalize_generated_title(raw_title: str) -> str:
    """Normalize AI output so cached highlight titles stay short and clean."""
    if not raw_title:
        return ""
    title = raw_title.strip()
    title = re.sub(r"[*_`#]+", " ", title)
    title = re.sub(r"^\s*(title|theme|summary)\s*:\s*", "", title, flags=re.IGNORECASE)
    title = re.sub(r"^[\"'“”‘’]+|[\"'“”‘’]+$", "", title)
    title = re.sub(r"\s+", " ", title).strip(" .,:;!?-")
    words = [word for word in title.split(" ") if word]
    return " ".join(words[:4]).strip(" .,:;!?-")


@router.post("/highlights/titles/refresh", response_model=List[HighlightGroupTitleOut])
def refresh_highlight_group_titles(
    paper_id: int = Query(..., description="Paper ID to (re)generate titles for"),
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    """
    For each color with highlights in this paper, regenerate a cached group title
    via summary_service and upsert. Prunes orphan titles for colors with no highlights.
    """
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper or not _can_access(paper, x_user_id):
        raise HTTPException(status_code=404, detail="Paper not found")

    active_colors = _active_colors_for_paper(db, x_user_id, paper_id)
    _prune_orphan_titles(db, x_user_id, paper_id, active_colors)

    if not active_colors:
        return []

    # Fetch all highlights for this paper once, group locally.
    highlights = (
        db.query(Highlight)
        .filter(Highlight.user_id == x_user_id, Highlight.paper_id == paper_id)
        .order_by(Highlight.created_at.desc())
        .all()
    )
    by_color: dict[str, list[Highlight]] = {}
    for h in highlights:
        by_color.setdefault(h.color, []).append(h)

    updated: list[HighlightGroupTitle] = []
    for color, items in by_color.items():
        bullets = "\n".join(f"• {h.highlighted_text}" for h in items)
        title = _generate_title_via_summary_service(bullets)
        if not title:
            title = f"{color.capitalize()} highlights"  # safe fallback

        row = (
            db.query(HighlightGroupTitle)
            .filter(
                HighlightGroupTitle.user_id == x_user_id,
                HighlightGroupTitle.paper_id == paper_id,
                HighlightGroupTitle.color == color,
            )
            .first()
        )
        if row:
            row.title = title
        else:
            row = HighlightGroupTitle(
                user_id=x_user_id,
                paper_id=paper_id,
                color=color,
                title=title,
            )
            db.add(row)
        updated.append(row)

    db.commit()
    for r in updated:
        db.refresh(r)
    return updated


@router.post("/highlights/titles/refresh-all", response_model=List[HighlightGroupTitleWithPaperOut])
def refresh_all_highlight_group_titles(
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    """
    Regenerate cached highlight titles for every (paper, color) group in the user's
    library. Orphan title rows are pruned if the underlying highlights no longer exist.
    """
    highlights = (
        db.query(Highlight)
        .filter(Highlight.user_id == x_user_id)
        .order_by(Highlight.created_at.desc())
        .all()
    )

    by_group: dict[tuple[int, str], list[Highlight]] = {}
    for highlight in highlights:
        by_group.setdefault((highlight.paper_id, highlight.color), []).append(highlight)

    active_keys = set(by_group.keys())
    _prune_orphan_titles_for_user(db, x_user_id, active_keys)

    if not by_group:
        return []

    updated: list[HighlightGroupTitle] = []
    for (paper_id, color), items in by_group.items():
        bullets = "\n".join(f"• {h.highlighted_text}" for h in items)
        title = _generate_title_via_summary_service(bullets) or f"{color.capitalize()} highlights"

        row = (
            db.query(HighlightGroupTitle)
            .filter(
                HighlightGroupTitle.user_id == x_user_id,
                HighlightGroupTitle.paper_id == paper_id,
                HighlightGroupTitle.color == color,
            )
            .first()
        )
        if row:
            row.title = title
        else:
            row = HighlightGroupTitle(
                user_id=x_user_id,
                paper_id=paper_id,
                color=color,
                title=title,
            )
            db.add(row)
        updated.append(row)

    db.commit()
    for row in updated:
        db.refresh(row)

    updated.sort(key=lambda row: (row.paper_id, row.color))
    return updated


# ── Persistent highlight color summaries (MyHighlights page) ──────────────────

def _generate_color_summary(bullets: str) -> Optional[str]:
    """Call summary_service to produce a paragraph summary of a color group's highlights."""
    try:
        with httpx.Client(timeout=45.0) as client:
            resp = client.post(
                f"{SUMMARY_SERVICE_URL}/summarize",
                json={"text": bullets, "size": "medium"},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            return (data.get("summary") or "").strip() or None
    except Exception as e:
        logger.warning("Failed to generate highlight color summary: %s", e)
        return None


@router.get("/highlights/color-summaries", response_model=List[HighlightColorSummaryOut])
def get_highlight_color_summaries(
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    """Return all cached color-group summaries for the user's MyHighlights page."""
    rows = db.query(HighlightColorSummary).filter(HighlightColorSummary.user_id == x_user_id).all()
    return rows


@router.post("/highlights/color-summaries/{color}", response_model=HighlightColorSummaryOut)
def upsert_highlight_color_summary(
    color: str,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    """
    Generate (or regenerate) and persist the AI summary for a user's highlight color group.
    Returns the saved summary row.
    """
    highlights = (
        db.query(Highlight)
        .filter(Highlight.user_id == x_user_id, Highlight.color == color)
        .order_by(Highlight.created_at.desc())
        .all()
    )
    if not highlights:
        raise HTTPException(status_code=404, detail="No highlights found for this color")

    bullets = "\n".join(f"• {h.highlighted_text}" for h in highlights)
    summary_text = _generate_color_summary(bullets)
    if not summary_text:
        raise HTTPException(status_code=502, detail="Summary service unavailable")

    row = (
        db.query(HighlightColorSummary)
        .filter(HighlightColorSummary.user_id == x_user_id, HighlightColorSummary.color == color)
        .first()
    )
    if row:
        row.summary = summary_text
    else:
        row = HighlightColorSummary(user_id=x_user_id, color=color, summary=summary_text)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ── Persistent notes paper summaries (MyNotes page) ──────────────────────────

def _generate_notes_summary(bullets: str) -> Optional[str]:
    """Call summary_service to summarize a paper's notes."""
    try:
        with httpx.Client(timeout=45.0) as client:
            resp = client.post(
                f"{SUMMARY_SERVICE_URL}/summarize",
                json={"text": bullets, "size": "medium"},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            return (data.get("summary") or "").strip() or None
    except Exception as e:
        logger.warning("Failed to generate notes paper summary: %s", e)
        return None


@router.get("/notes/paper-summaries", response_model=List[NotesPaperSummaryOut])
def get_notes_paper_summaries(
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    """Return all cached per-paper note summaries for the user's MyNotes page."""
    rows = db.query(NotesPaperSummary).filter(NotesPaperSummary.user_id == x_user_id).all()
    return rows


@router.post("/notes/paper-summaries/{paper_id}", response_model=NotesPaperSummaryOut)
def upsert_notes_paper_summary(
    paper_id: int,
    x_user_id: int = Header(..., alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    """
    Generate (or regenerate) and persist the AI summary for a user's notes on a paper.
    Returns the saved summary row.
    """
    notes = (
        db.query(Note)
        .filter(Note.user_id == x_user_id, Note.paper_id == paper_id)
        .order_by(Note.updated_at.desc())
        .all()
    )
    if not notes:
        raise HTTPException(status_code=404, detail="No notes found for this paper")

    bullets = "\n".join(
        f"• {('[on: \"' + n.selected_text[:120] + '\"] ') if n.selected_text else ''}{n.content}"
        for n in notes
    )
    summary_text = _generate_notes_summary(bullets)
    if not summary_text:
        raise HTTPException(status_code=502, detail="Summary service unavailable")

    row = (
        db.query(NotesPaperSummary)
        .filter(NotesPaperSummary.user_id == x_user_id, NotesPaperSummary.paper_id == paper_id)
        .first()
    )
    if row:
        row.summary = summary_text
    else:
        row = NotesPaperSummary(user_id=x_user_id, paper_id=paper_id, summary=summary_text)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row
