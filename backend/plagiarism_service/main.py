"""
Plagiarism Checker Microservice

This service computes similarity/plagiarism scores between input text and documents
stored in the library service.

Pipeline Overview:
1. RECEIVE INPUT: FastAPI endpoint receives POST /check with {text, top_k}
2. FETCH DOCUMENTS: Attempts to fetch papers from library service via LIBRARY_SERVICE_URL
   - Falls back to sample_docs.json if library service unavailable
   - Library service returns papers with: id, title, full_text (not 'content')
3. PREPROCESS & CHUNK: 
   - Documents are split into overlapping chunks (for better partial match detection)
   - Query text is kept as-is (or can be chunked if very long)
4. EMBED TEXT: Uses TF-IDF vectorization (scikit-learn)
   - Vectorizer is fit on all document chunks + query
   - Creates sparse TF-IDF vectors for query and all document chunks
5. COMPUTE SIMILARITY: Cosine similarity between query vector and each document chunk
   - Cosine similarity ranges from 0.0 (no similarity) to 1.0 (identical)
   - For each document, we take the MAX similarity across all its chunks
     (this ensures that if any part of a document matches, we get a high score)
6. AGGREGATE & RANK: 
   - Each document gets its maximum chunk similarity as its final score
   - Documents are sorted by score (descending)
   - Top K matches are returned

Mathematical Representation:
- Final score for document D = max(cosine_similarity(query, chunk_i) for all chunks i in D)
- This max aggregation is optimal for plagiarism detection because:
  * Identical text → score ≈ 1.0
  * Strong overlap → score > 0.7
  * Partial overlap → score 0.3-0.7
  * Unrelated → score < 0.3
"""

import os
import json
import logging
import re
from typing import List

import requests
from fastapi import FastAPI, HTTPException
from dotenv import load_dotenv
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .schemas import CheckRequest, CheckResponse, Match

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI(title="Plagiarism Checker")

# Configuration constants
CHUNK_SIZE = 500  # Characters per chunk for document splitting
CHUNK_OVERLAP = 100  # Overlap between chunks to avoid missing matches at boundaries


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """
    Split text into overlapping chunks for better partial match detection.
    
    Args:
        text: Input text to chunk
        chunk_size: Maximum characters per chunk
        overlap: Number of characters to overlap between chunks
    
    Returns:
        List of text chunks
    """
    if len(text) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
        if start >= len(text):
            break
    
    return chunks


def fetch_library_docs() -> List[dict]:
    """
    Fetch documents from the library service.
    
    The library service returns papers with structure:
    {
        "id": int,
        "title": str,
        "full_text": str,  # NOTE: field is 'full_text', not 'content'
        "summary": str,
        "authors": List[str],
        ...
    }
    
    Returns:
        List of document dictionaries with at least: id, title, full_text
    """
    # Try to get URL from env, with fallback to default
    url = os.getenv("LIBRARY_SERVICE_URL")
    if not url:
        # Default to library service endpoint
        url = "http://localhost:8002/api/v1/papers"
        logger.info(f"LIBRARY_SERVICE_URL not set, using default: {url}")
    else:
        logger.info(f"Using LIBRARY_SERVICE_URL from env: {url}")
        # If URL doesn't end with /papers, append it
        if not url.endswith('/papers') and '/papers' not in url:
            url = url.rstrip('/') + '/api/v1/papers'
            logger.info(f"Adjusted URL to: {url}")
    
    # Fetch all papers - library service has limit=100, so we may need multiple requests
    all_docs = []
    skip = 0
    limit = 100
    max_iterations = 10  # Safety limit to prevent infinite loops
    
    # Clean up URL - remove trailing slash and ensure proper format
    base_url = url.rstrip('/')
    if '?' in base_url:
        # URL already has query params, extract base
        base_url = base_url.split('?')[0]
    
    try:
        for iteration in range(max_iterations):
            # Build URL with pagination
            fetch_url = f"{base_url}?skip={skip}&limit={limit}"
            logger.info(f"Attempt {iteration + 1}: Fetching from {fetch_url}")
            
            resp = requests.get(fetch_url, timeout=10)
            logger.info(f"Response status: {resp.status_code}")
            
            resp.raise_for_status()
            data = resp.json()
            
            logger.info(f"Received {len(data) if isinstance(data, list) else 'non-list'} items from library service")
            
            # Expect list of paper objects
            if isinstance(data, list):
                if not data:  # No more papers
                    logger.info("No more papers to fetch (empty list)")
                    break
                
                # Normalize the response: library service uses 'full_text', not 'content'
                for doc in data:
                    # Handle both 'full_text' (from library service) and 'content' (from sample)
                    content = doc.get("full_text") or doc.get("content", "")
                    if content:  # Only add documents with content
                        all_docs.append({
                            "id": doc.get("id"),
                            "title": doc.get("title"),
                            "content": content  # Normalize to 'content' for internal use
                        })
                    else:
                        logger.warning(f"Document {doc.get('id')} has no content field")
                
                logger.info(f"Added {len([d for d in data if (d.get('full_text') or d.get('content', ''))])} documents in this batch")
                
                # If we got fewer than limit, we've reached the end
                if len(data) < limit:
                    logger.info(f"Reached end of papers (got {len(data)}, limit was {limit})")
                    break
                
                skip += limit
            else:
                logger.error(f"Unexpected response format from library service: {type(data)}. Expected list, got {type(data)}")
                logger.error(f"Response content: {str(data)[:500]}")
                break
        
        if all_docs:
            logger.info(f"Successfully fetched {len(all_docs)} documents from library service")
            return all_docs
        else:
            logger.error("No documents fetched from library service after all attempts")
            
    except requests.exceptions.ConnectionError as e:
        logger.error(f"Connection error: Cannot connect to library service at {url}. Is the library service running? Error: {e}")
        import traceback
        logger.error(traceback.format_exc())
    except requests.exceptions.Timeout as e:
        logger.error(f"Timeout error: Library service at {url} did not respond in time. Error: {e}")
        import traceback
        logger.error(traceback.format_exc())
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error: Library service returned error status. URL: {url}, Status: {e.response.status_code if hasattr(e, 'response') else 'unknown'}, Error: {e}")
        import traceback
        logger.error(traceback.format_exc())
    except Exception as e:
        logger.error(f"Failed to fetch from library service: {type(e).__name__}: {e}")
        import traceback
        logger.error(traceback.format_exc())

    # Fallback to bundled sample - but warn user this is not ideal
    logger.error("=" * 80)
    logger.error("WARNING: Falling back to sample_docs.json (only 3 dummy documents)")
    logger.error("This means the plagiarism checker will NOT compare against your actual database!")
    logger.error("Please check:")
    logger.error("  1. Is the library service running on port 8002?")
    logger.error(f"  2. Can you access {base_url}?")
    logger.error("  3. Is LIBRARY_SERVICE_URL environment variable set correctly?")
    logger.error("=" * 80)
    
    here = os.path.dirname(__file__)
    sample_path = os.path.join(here, "sample_docs.json")
    try:
        logger.warning("Using fallback sample_docs.json - THIS IS NOT YOUR ACTUAL DATABASE!")
        with open(sample_path, "r", encoding="utf-8") as f:
            sample_docs = json.load(f)
            logger.warning(f"Loaded {len(sample_docs)} sample documents (NOT from your database)")
            return sample_docs
    except Exception as e:
        raise RuntimeError("Unable to fetch library documents and fallback also failed: " + str(e))


def normalize_text(text: str) -> str:
    """
    Normalize text for comparison by:
    - Converting to lowercase
    - Normalizing whitespace (multiple spaces/newlines to single space)
    - Stripping leading/trailing whitespace
    
    This helps handle minor formatting differences.
    """
    # Normalize whitespace: replace multiple spaces/newlines/tabs with single space
    normalized = re.sub(r'\s+', ' ', text.lower().strip())
    return normalized


def compute_exact_match_score(query: str, doc_content: str) -> float:
    """
    Compute exact match score for identical or near-identical text.
    Returns 1.0 for identical text, high score for very similar text.
    """
    # Normalize both texts
    norm_query = normalize_text(query)
    norm_doc = normalize_text(doc_content)
    
    # Exact match
    if norm_query == norm_doc:
        return 1.0
    
    # Check if query is contained in document (or vice versa)
    if norm_query in norm_doc or norm_doc in norm_query:
        # Compute ratio of shorter to longer
        shorter = min(len(norm_query), len(norm_doc))
        longer = max(len(norm_query), len(norm_doc))
        if longer > 0:
            return min(1.0, 0.95 + (shorter / longer) * 0.05)  # 0.95-1.0 range
    
    # Check character-level similarity for very similar text
    if len(norm_query) > 0 and len(norm_doc) > 0:
        # Simple character overlap ratio
        query_chars = set(norm_query)
        doc_chars = set(norm_doc)
        if len(query_chars) > 0:
            overlap_ratio = len(query_chars & doc_chars) / len(query_chars | doc_chars)
            if overlap_ratio > 0.95:  # Very high character overlap
                return 0.9
    
    return 0.0  # Not an exact match, use TF-IDF instead


def compute_top_k_matches(query: str, docs: List[dict], top_k: int = 5) -> List[Match]:
    """
    Compute similarity scores between query and documents using TF-IDF + cosine similarity.
    
    Process:
    1. First check for exact/near-exact matches (for identical text)
    2. Extract content from documents (using 'content' field)
    3. Split documents into overlapping chunks for better partial matching
    4. Build TF-IDF vectors for all chunks + query
    5. Compute cosine similarity between query and each chunk
    6. For each document, take MAX similarity across all its chunks
    7. Return top K matches sorted by score
    
    Args:
        query: Input text to check for plagiarism
        docs: List of documents with 'id', 'title', 'content' fields
        top_k: Number of top matches to return
    
    Returns:
        List of Match objects sorted by score (descending)
    """
    if not docs:
        return []
    
    if not query or not query.strip():
        logger.warning("Empty query text")
        return []
    
    # First, check for exact matches (this handles identical text perfectly)
    exact_matches = []
    for doc in docs:
        content = doc.get("content", "")
        if not content or not content.strip():
            continue
        
        exact_score = compute_exact_match_score(query, content)
        if exact_score > 0.9:  # Very high similarity from exact match
            exact_matches.append({
                "id": str(doc.get("id", "")),
                "title": doc.get("title"),
                "score": exact_score
            })
            logger.info(f"Found exact/near-exact match for document {doc.get('id')} with score {exact_score}")
    
    # If we found exact matches, return them (they should be highest priority)
    if exact_matches:
        exact_matches.sort(key=lambda x: x["score"], reverse=True)
        results = [Match(id=m["id"], title=m["title"], score=m["score"]) for m in exact_matches[:top_k]]
        logger.info(f"Returning {len(results)} exact matches")
        return results
    
    # Extract document contents and metadata for TF-IDF matching
    doc_contents = []
    doc_metadata = []  # (id, title, chunk_index)
    
    for doc in docs:
        content = doc.get("content", "")
        if not content or not content.strip():
            logger.warning(f"Document {doc.get('id')} has empty content, skipping")
            continue
        
        # Split document into chunks for better partial matching
        chunks = chunk_text(content, CHUNK_SIZE, CHUNK_OVERLAP)
        
        for chunk_idx, chunk in enumerate(chunks):
            doc_contents.append(chunk)
            doc_metadata.append((
                str(doc.get("id", "")),
                doc.get("title"),
                chunk_idx
            ))
    
    if not doc_contents:
        logger.warning("No valid document content found")
        return []
    
    logger.info(f"Processing {len(doc_contents)} chunks from {len(docs)} documents")
    
    # Build TF-IDF vectors
    # Fit vectorizer on all document chunks + query to ensure consistent vocabulary
    all_texts = doc_contents + [query]
    
    # Use more lenient TF-IDF settings to catch more similarities
    vectorizer = TfidfVectorizer(
        lowercase=True,
        stop_words=None,  # Don't remove stop words - they're important for exact matches
        ngram_range=(1, 3),  # Use unigrams, bigrams, and trigrams for better phrase matching
        min_df=1,  # Include all terms (no minimum document frequency)
        max_df=0.99,  # More lenient - exclude only terms in >99% of documents
        token_pattern=r'(?u)\b\w+\b'  # Word token pattern
    )
    
    try:
        vectors = vectorizer.fit_transform(all_texts)
    except ValueError as e:
        logger.error(f"TF-IDF vectorization failed: {e}")
        # Fallback: if vectorization fails (e.g., all empty), return empty results
        return []
    
    # Separate query vector and document chunk vectors
    query_vec = vectors[-1]
    doc_vecs = vectors[:-1]
    
    # Compute cosine similarity between query and all document chunks
    # Cosine similarity is normalized (ranges 0.0 to 1.0)
    similarities = cosine_similarity(query_vec, doc_vecs).flatten()
    
    # Group similarities by document (take MAX per document)
    # This ensures that if any chunk of a document matches well, we get a high score
    doc_scores = {}  # doc_id -> (max_score, title)
    
    for (doc_id, title, chunk_idx), sim_score in zip(doc_metadata, similarities):
        if doc_id not in doc_scores or sim_score > doc_scores[doc_id][0]:
            doc_scores[doc_id] = (float(sim_score), title)
    
    # Log top similarities for debugging
    sorted_scores = sorted(doc_scores.items(), key=lambda x: x[1][0], reverse=True)
    logger.info(f"Top 3 similarity scores: {[(doc_id, f'{score[0]:.4f}') for doc_id, score in sorted_scores[:3]]}")
    
    # Convert to Match objects and sort by score
    results = []
    for doc_id, (score, title) in sorted_scores:
        results.append(Match(id=doc_id, title=title, score=score))
    
    # Sort by score (descending) and return top K
    results.sort(key=lambda x: x.score, reverse=True)
    return results[:top_k]


@app.post("/check", response_model=CheckResponse)
def check_plagiarism(payload: CheckRequest):
    """
    Check plagiarism/similarity of input text against stored documents.
    
    Request body:
        - text: str - Text to check for plagiarism
        - top_k: int (default=5) - Number of top matches to return
    
    Response:
        - query: str - Echo of input text
        - matches: List[Match] - Top K matches with id, title, and similarity score (0.0-1.0)
    """
    try:
        docs = fetch_library_docs()
    except Exception as e:
        logger.error(f"Error fetching documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    if not docs:
        logger.warning("No documents available for comparison")
        return CheckResponse(query=payload.text, matches=[])

    matches = compute_top_k_matches(payload.text, docs, top_k=payload.top_k)
    logger.info(f"Returning {len(matches)} matches for query (length: {len(payload.text)} chars)")
    
    return CheckResponse(query=payload.text, matches=matches)


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok"}
