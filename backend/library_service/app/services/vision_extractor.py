"""
Vision-based extraction using Gemini Vision (multimodal).

Two capabilities:
  1. ocr_pdf_pages()     — extract text from rendered page images (scanned PDFs)
  2. describe_figures()  — describe significant embedded figures in one call

Both are intentionally cheap:
  - OCR:     batches of OCR_PAGES_PER_BATCH pages per Gemini call (not one call per page)
  - Figures: single Gemini call regardless of figure count (≤ MAX_FIGURES)
  - Prompts: minimal, requesting 1-sentence outputs
"""
from __future__ import annotations

import io
import logging
import os
import re
from typing import Optional

logger = logging.getLogger(__name__)

OCR_PAGES_PER_BATCH: int = int(os.getenv("OCR_PAGES_PER_BATCH", "4"))

# ── Lazy imports (Pillow for Developer API, Vertex Part for Vertex AI) ─────────

try:
    import PIL.Image
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False

try:
    from vertexai.generative_models import Part as VertexPart
    _VERTEX_PART_AVAILABLE = True
except ImportError:
    _VERTEX_PART_AVAILABLE = False

# ── Prompts ────────────────────────────────────────────────────────────────────

_OCR_PROMPT = (
    "Extract all text visible in these PDF page images in reading order. "
    "Preserve paragraph and section breaks. Return plain text only — "
    "no commentary, no markdown formatting."
)

_FIGURE_PROMPT = (
    "You are analyzing figures extracted from an academic document. "
    "For each numbered image, write exactly one line using this format:\n"
    "N. [Short title if visible in the figure, else 'Figure N']: "
    "[One sentence describing what the figure shows.]\n"
    "Output ONLY the numbered list, nothing else."
)

# ── Helpers ────────────────────────────────────────────────────────────────────

def _use_vertex() -> bool:
    return bool(
        os.getenv("VERTEX_AI_PROJECT", "").strip()
        and os.getenv("VERTEX_AI_LOCATION", "").strip()
    )


def _make_image_parts(image_bytes_list: list[bytes]) -> list:
    """Return image parts in the format expected by the active Gemini SDK."""
    if _use_vertex() and _VERTEX_PART_AVAILABLE:
        return [VertexPart.from_data(b, mime_type="image/png") for b in image_bytes_list]
    if _PIL_AVAILABLE:
        parts = []
        for b in image_bytes_list:
            try:
                parts.append(PIL.Image.open(io.BytesIO(b)))
            except Exception as e:
                logger.debug("_make_image_parts: skipping unreadable image: %s", e)
        return parts
    logger.warning("vision_extractor: neither Pillow nor Vertex Part available — cannot send images")
    return []


def _call_gemini(parts: list) -> Optional[str]:
    """Call Gemini with a mixed text + image parts list. Returns text or None."""
    # Import here to avoid circular imports at module level
    from .document_structured import _get_model
    model = _get_model()
    if model is None:
        return None
    try:
        response = model.generate_content(parts)
        text = (getattr(response, "text", None) or "").strip()
        return text if text else None
    except Exception as e:
        logger.warning("vision_extractor._call_gemini: %s", e)
        return None

# ── Public API ─────────────────────────────────────────────────────────────────

def ocr_pdf_pages(page_images: list[bytes]) -> str:
    """
    OCR a list of rendered PDF page images using Gemini Vision.
    Pages are sent in batches of OCR_PAGES_PER_BATCH to keep each call cheap.
    Returns combined plain text.
    """
    if not page_images:
        return ""
    if not (_PIL_AVAILABLE or (_use_vertex() and _VERTEX_PART_AVAILABLE)):
        logger.warning("vision_extractor.ocr_pdf_pages: image SDK not available")
        return ""

    texts: list[str] = []
    batch_size = OCR_PAGES_PER_BATCH

    for batch_start in range(0, len(page_images), batch_size):
        batch = page_images[batch_start : batch_start + batch_size]
        image_parts = _make_image_parts(batch)
        if not image_parts:
            continue
        result = _call_gemini([_OCR_PROMPT] + image_parts)
        if result:
            texts.append(result)
        else:
            logger.warning(
                "vision_extractor.ocr_pdf_pages: batch %d returned nothing",
                batch_start // batch_size,
            )

    return "\n\n".join(texts)


def describe_figures(figure_images: list[bytes]) -> str:
    """
    Describe all figures in a single Gemini Vision call.
    Returns a formatted block appended to raw_text, e.g.:

      --- Figures ---
      [Figure 1 - Loss Curve: Shows training and validation loss decreasing over 100 epochs.]
      [Figure 2 - Architecture: Illustrates the three-layer encoder-decoder structure.]
    """
    if not figure_images:
        return ""
    if not (_PIL_AVAILABLE or (_use_vertex() and _VERTEX_PART_AVAILABLE)):
        return ""

    image_parts = _make_image_parts(figure_images)
    if not image_parts:
        return ""

    raw = _call_gemini([_FIGURE_PROMPT] + image_parts)
    if not raw:
        return ""

    # Parse "N. Title: description" lines → "[Title: description]" markers
    lines: list[str] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^\d+[\.\)]\s*(.+)$", line)
        content = m.group(1).strip() if m else line
        if content:
            lines.append(f"[{content}]")

    if not lines:
        return ""

    return "\n--- Figures ---\n" + "\n".join(lines)
