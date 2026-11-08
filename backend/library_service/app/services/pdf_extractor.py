"""
Stage 1: PDF text extraction.

Pipeline:
  1. pypdf text extraction  — fast, zero cost, works on digital PDFs
  2. Gemini Vision OCR      — fallback when text layer is absent/sparse (scanned PDFs)
  3. Figure descriptions    — best-effort; describes significant embedded images via Gemini Vision

Token-cost design:
  - OCR:     pages sent in batches (OCR_PAGES_PER_BATCH=4), not one call per page
  - Figures: all figures in ONE Gemini call, 1-sentence outputs, capped at MAX_FIGURES=6
  - Both stages skip gracefully if Gemini or PyMuPDF is unavailable
"""
from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# ── Config (overridable via env) ───────────────────────────────────────────────

MIN_CHARS_PER_PAGE: int = 80      # below this avg → text layer is sparse → needs OCR
MIN_TOTAL_CHARS: int = 100         # below this total → considered empty
MAX_OCR_PAGES: int = int(os.getenv("MAX_OCR_PAGES", "15"))   # cap for rendering
MAX_FIGURES: int = int(os.getenv("MAX_FIGURES", "6"))         # max figures to describe
MIN_FIGURE_W: int = int(os.getenv("MIN_FIGURE_W", "100"))    # px — skip tiny images
MIN_FIGURE_H: int = int(os.getenv("MIN_FIGURE_H", "80"))     # px
MIN_FIGURE_BYTES: int = int(os.getenv("MIN_FIGURE_BYTES", "4000"))  # bytes

# ── Optional deps ──────────────────────────────────────────────────────────────

try:
    from pypdf import PdfReader
    _PYPDF_AVAILABLE = True
except ImportError:
    PdfReader = None  # type: ignore
    _PYPDF_AVAILABLE = False

try:
    import fitz  # PyMuPDF — used for page rendering and image extraction
    _PYMUPDF_AVAILABLE = True
except ImportError:
    _PYMUPDF_AVAILABLE = False
    logger.warning(
        "PyMuPDF (pymupdf) not installed. "
        "OCR fallback and figure extraction are disabled. "
        "Install with: pip install pymupdf"
    )

# ── Result type ────────────────────────────────────────────────────────────────

@dataclass
class ExtractionResult:
    raw_text: str
    page_count: int
    extraction_quality: str  # "good" | "poor" | "empty" | "ocr"
    needs_ocr: bool
    figure_count: int = 0
    doc_type: str = "paper"  # "paper" | "slides" | "report"

# ── Document type detection ───────────────────────────────────────────────────

def _detect_doc_type(raw_text: str, page_count: int) -> str:
    """
    Heuristic: is this a presentation/slides or a normal document?
    Slides have many short lines, bullet markers, and few long paragraphs.
    """
    if not raw_text or page_count == 0:
        return "paper"

    lines = [l for l in raw_text.splitlines() if l.strip()]
    if not lines:
        return "paper"

    avg_line_len = sum(len(l) for l in lines) / len(lines)
    short_line_ratio = sum(1 for l in lines if len(l.strip()) < 80) / len(lines)
    bullet_count = sum(1 for l in lines if l.strip().startswith(("●", "•", "○", "–", "- ", "* ")))
    bullet_ratio = bullet_count / len(lines)

    # Slides: short lines dominate, many bullets, low chars/page
    chars_per_page = len(raw_text.replace(" ", "").replace("\n", "")) / page_count
    if (
        avg_line_len < 70
        and short_line_ratio > 0.65
        and (bullet_ratio > 0.15 or chars_per_page < 800)
    ):
        return "slides"

    return "paper"


# ── Stage 1: pypdf digital text extraction ─────────────────────────────────────

def _digital_extract(pdf_bytes: bytes, page_limit: Optional[int]) -> ExtractionResult:
    if not _PYPDF_AVAILABLE:
        return ExtractionResult("", 0, "empty", True)
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        page_count = len(reader.pages)
        if page_limit is not None:
            page_count = min(page_count, page_limit)

        page_texts: list[str] = []
        for i in range(page_count):
            try:
                # "layout" mode uses X/Y positions to reconstruct spatial reading order —
                # critical for slide-based PDFs where text boxes are scattered across the page.
                # Falls back to default extraction if layout mode isn't supported.
                page = reader.pages[i]
                try:
                    text = page.extract_text(extraction_mode="layout") or ""
                except TypeError:
                    text = page.extract_text() or ""
                page_texts.append(text.strip())
            except Exception:
                page_texts.append("")

        raw_text = "\n\n".join(page_texts)
        total_chars = len(raw_text.replace("\n", "").replace(" ", ""))

        if total_chars < MIN_TOTAL_CHARS:
            quality, needs_ocr = "empty", True
        elif page_count and (total_chars / page_count) < MIN_CHARS_PER_PAGE:
            quality, needs_ocr = "poor", True
        else:
            quality, needs_ocr = "good", False

        doc_type = _detect_doc_type(raw_text, page_count)
        return ExtractionResult(raw_text, page_count, quality, needs_ocr, doc_type=doc_type)
    except Exception as e:
        logger.warning("_digital_extract failed: %s", e)
        return ExtractionResult("", 0, "empty", True)

# ── Stage 2 helper: render pages as PNG images via PyMuPDF ────────────────────

def _render_pages(pdf_bytes: bytes, page_limit: Optional[int]) -> list[bytes]:
    """Render PDF pages at ~130 DPI. Good quality / small file size trade-off."""
    if not _PYMUPDF_AVAILABLE:
        return []
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        n = min(len(doc), page_limit or len(doc), MAX_OCR_PAGES)
        mat = fitz.Matrix(1.8, 1.8)  # ~130 DPI
        images: list[bytes] = []
        for i in range(n):
            try:
                pix = doc[i].get_pixmap(matrix=mat)
                images.append(pix.tobytes("png"))
            except Exception as e:
                logger.debug("_render_pages: page %d failed: %s", i, e)
        doc.close()
        return images
    except Exception as e:
        logger.warning("_render_pages failed: %s", e)
        return []

# ── Stage 3 helper: extract significant embedded images ────────────────────────

def _extract_figures(pdf_bytes: bytes, page_limit: Optional[int]) -> list[bytes]:
    """
    Pull embedded images from each page, apply filters:
      - minimum width/height (skip icons, logos, decorative lines)
      - minimum file size
      - maximum aspect ratio (skip horizontal/vertical rule dividers)
    Returns PNG bytes, capped at MAX_FIGURES.
    """
    if not _PYMUPDF_AVAILABLE:
        return []
    figures: list[bytes] = []
    seen_xrefs: set[int] = set()
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        n = min(len(doc), page_limit or len(doc))
        for page_num in range(n):
            if len(figures) >= MAX_FIGURES:
                break
            try:
                page = doc[page_num]
                for img_ref in page.get_images(full=True):
                    if len(figures) >= MAX_FIGURES:
                        break
                    xref = img_ref[0]
                    if xref in seen_xrefs:
                        continue
                    seen_xrefs.add(xref)
                    try:
                        base = doc.extract_image(xref)
                        w = base.get("width", 0)
                        h = base.get("height", 0)
                        img_bytes = base["image"]

                        # Size filters
                        if w < MIN_FIGURE_W or h < MIN_FIGURE_H:
                            continue
                        if len(img_bytes) < MIN_FIGURE_BYTES:
                            continue
                        # Extreme aspect ratio → decorative line/banner
                        if min(w, h) > 0 and max(w, h) / min(w, h) > 12:
                            continue

                        # Normalize to PNG
                        ext = base.get("ext", "png")
                        if ext.lower() != "png":
                            try:
                                pix = fitz.Pixmap(doc, xref)
                                if pix.n > 4:  # CMYK → RGB
                                    pix = fitz.Pixmap(fitz.csRGB, pix)
                                img_bytes = pix.tobytes("png")
                            except Exception:
                                pass  # keep original bytes

                        figures.append(img_bytes)
                    except Exception as e:
                        logger.debug("_extract_figures: xref %d failed: %s", xref, e)
            except Exception as e:
                logger.debug("_extract_figures: page %d failed: %s", page_num, e)
        doc.close()
    except Exception as e:
        logger.warning("_extract_figures failed: %s", e)
    return figures

# ── Public API ─────────────────────────────────────────────────────────────────

def extract_text_from_pdf(
    pdf_bytes: bytes,
    page_limit: Optional[int] = None,
) -> ExtractionResult:
    """
    Full extraction pipeline:
      1. pypdf digital text
      2. Gemini Vision OCR (if text layer absent/sparse)
      3. Gemini Vision figure descriptions (best-effort, always attempted)
    """
    # ── Stage 1: digital text ─────────────────────────────────────────────────
    result = _digital_extract(pdf_bytes, page_limit)
    logger.info(
        "extract_text_from_pdf: digital quality=%s chars=%d needs_ocr=%s",
        result.extraction_quality, len(result.raw_text), result.needs_ocr,
    )

    # ── Stage 2: OCR fallback ─────────────────────────────────────────────────
    if result.needs_ocr:
        logger.info("extract_text_from_pdf: attempting Gemini Vision OCR")
        page_images = _render_pages(pdf_bytes, page_limit)
        if page_images:
            try:
                from .vision_extractor import ocr_pdf_pages
                ocr_text = ocr_pdf_pages(page_images)
                if ocr_text and len(ocr_text.strip()) >= MIN_TOTAL_CHARS:
                    result.raw_text = ocr_text
                    result.extraction_quality = "ocr"
                    result.needs_ocr = False
                    logger.info(
                        "extract_text_from_pdf: OCR succeeded, %d chars", len(ocr_text)
                    )
                else:
                    logger.warning("extract_text_from_pdf: OCR returned no useful text")
            except Exception as e:
                logger.warning("extract_text_from_pdf: OCR stage failed (non-fatal): %s", e)
        else:
            logger.warning("extract_text_from_pdf: could not render pages for OCR")

    # ── Stage 3: figure descriptions (best-effort) ────────────────────────────
    if _PYMUPDF_AVAILABLE:
        try:
            figures = _extract_figures(pdf_bytes, page_limit)
            if figures:
                logger.info(
                    "extract_text_from_pdf: found %d figures, requesting descriptions", len(figures)
                )
                from .vision_extractor import describe_figures
                fig_text = describe_figures(figures)
                if fig_text:
                    result.raw_text += "\n\n" + fig_text
                    result.figure_count = len(figures)
        except Exception as e:
            logger.warning(
                "extract_text_from_pdf: figure description failed (non-fatal): %s", e
            )

    return result
