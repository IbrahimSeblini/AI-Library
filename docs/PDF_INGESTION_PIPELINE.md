# PDF Ingestion Pipeline

This document describes the 2-stage PDF ingestion pipeline and which files were changed.

---

## Why the previous extraction was messy

- **Frontend-only extraction**: PDF text was extracted in the browser with `pdfjs-dist` and sent as a single blob. There was no separation of metadata (title, authors, abstract) from body text.
- **No structure**: The backend stored one `full_text` field. Title came from the filename; summary was the first 400 characters. Headers, affiliations, abstract, and sections were all merged into one flow.
- **Rendering**: The reading page rendered `fullText` as one block, so the document looked like one giant blob.

---

## Goal

When a user uploads a PDF:

1. **Stage 1**: Extract raw text from the PDF (preserve page order; detect poor/empty extraction for future OCR).
2. **Stage 2**: Send raw text to Gemini to produce a **strict structured JSON** (title, authors, affiliations, emails, published_date, subject, abstract, keywords, sections, references, clean_full_text).
3. **Storage**: Store both raw extracted text and the structured JSON. Keep existing fields (title, authors, summary, full_text) populated from the structured result.
4. **Frontend**: Render the document as metadata, abstract, keywords, sectioned body, and references—not as one blob.

---

## Files changed and why

### Backend – library_service

| File | Change |
|------|--------|
| **requirements.txt** | Added `pypdf`, `google-generativeai` for PDF parsing and Gemini. |
| **app/core/config.py** | Added `GEMINI_API_KEY`, `INGESTION_PAGE_LIMIT`, `INGESTION_FILE_SIZE_MB`. |
| **app/schemas/structured_document.py** | **New.** Pydantic model for Gemini output: `StructuredDocument` (title, authors, affiliations, emails, published_date, subject, abstract, keywords, sections, references, clean_full_text) and `DocumentSection`. Validation before storing. |
| **app/services/__init__.py** | **New.** Package marker for services. |
| **app/services/pdf_extractor.py** | **New.** Stage 1: extract text with `pypdf`, preserve page order, return `ExtractionResult` (raw_text, page_count, extraction_quality, needs_ocr). Handles page limit; placeholder for future OCR. |
| **app/services/document_structured.py** | **New.** Stage 2: call Gemini with a strict prompt, parse JSON, validate with `StructuredDocument`. Truncates input to `GEMINI_INGESTION_MAX_INPUT_CHARS`. Returns `None` if Gemini is unavailable or parsing fails. |
| **app/db/models/paper.py** | Added `raw_extracted_text` (nullable Text), `structured_content` (nullable Text, JSON string). |
| **app/db/migrate_structured_columns.py** | **New.** Migration: add `raw_extracted_text` and `structured_content` to `papers`. |
| **app/main.py** | Run `run_migrate_structured_columns()` on startup. |
| **app/schemas/paper.py** | Added `Optional[structured_content]` to `PaperOut` so GET returns it for the frontend. |
| **app/api/v1/routes.py** | Added `POST /papers/upload`: accept PDF file, enforce size/page limits, run Stage 1 → Stage 2, build Paper (title, authors, year, subject, summary, full_text from structured; store raw_extracted_text, structured_content). Updated `_paper_to_out` to include `structured_content`. |

### Backend – gateway

| File | Change |
|------|--------|
| **main.py** | Added route `POST /api/papers/upload` → library service `/api/v1/papers/upload` with **120s timeout** (extract + Gemini). Registered before the generic `/api/papers/{path}` so upload is matched first. |

### Frontend

| File | Change |
|------|--------|
| **types.ts** | Added `DocumentSection`, `StructuredContent`, and `Paper.structuredContent` for sectioned/structured rendering. |
| **services/apiService.ts** | Added `uploadPaperPdf(file)` (POST FormData to `/api/papers/upload`, auth). Updated `getPaperById` to parse and attach `structured_content` as `structuredContent`. |
| **components/Home.tsx** | For **PDF** uploads: call `uploadPaperPdf(file)` (backend pipeline). For TXT/EPUB: keep existing client-side extract + `createPaper`. |
| **components/PaperDetail.tsx** | When `paper.structuredContent` is present: render **metadata** (affiliations, emails, published_date), **Abstract**, **Keywords**, **Contents** (sections with heading + content), **References**. Then the existing **Full Text** block (HighlightableText + summarize/paraphrase/read aloud) so highlighting and tools still use `paper.fullText`. Legacy papers without structure still render as before (title, summary, full text). |

---

## Scalability and limits

- **File size**: Configurable `INGESTION_FILE_SIZE_MB` (default 25 MB).
- **Page limit**: `INGESTION_PAGE_LIMIT` (default 50). Extraction stops after that many pages.
- **Gemini input**: Raw text is truncated to `GEMINI_INGESTION_MAX_INPUT_CHARS` (default 120k) to stay within model limits.
- **Upload timeout**: Gateway uses 120s for `/api/papers/upload`.
- **OCR**: Stage 1 sets `needs_ocr` when extraction is poor/empty; OCR is not implemented yet (placeholder for future use).

Chunking or background jobs can be added later; the pipeline is built so that long-running or async ingestion can be plugged in without changing the schema or frontend contract.

---

## Downstream features

- **Reading**: Sectioned view + full text block; `paper.fullText` is used for tools.
- **Highlighting**: Uses `paper.fullText` in the Full Text block; offsets refer to that string.
- **Summarize / Paraphrase**: Use `paper.fullText`.
- **Read aloud**: Uses `paper.fullText`.
- **Quiz**: Unchanged; still uses `paper` and `paper.fullText`.

---

## Running the pipeline

1. **Install backend deps** (from `backend/library_service`):  
   `pip install -r requirements.txt`  
   (installs `pypdf`, `google-generativeai`).

2. **Environment**: Set `GEMINI_API_KEY` for Stage 2. If unset, upload still works but stores raw text only (no structured JSON).

3. **Upload**: User selects a PDF on Home → “Add to my library” → request goes to `POST /api/papers/upload` → Stage 1 (extract) → Stage 2 (Gemini) → save → redirect to the new paper. The reading page then shows metadata, abstract, keywords, sections, and references when `structured_content` is present.
