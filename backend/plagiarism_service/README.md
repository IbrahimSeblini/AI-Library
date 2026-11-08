# Plagiarism Checker Microservice

This microservice computes cosine similarity between a submitted text and documents in the library.

How it works
- FastAPI app exposing `POST /check` that accepts JSON `{ "text": "...", "top_k": 5 }`.
- The service attempts to fetch documents from the library service using the env var `LIBRARY_SERVICE_URL` (e.g. `http://localhost:8002/api/v1/papers`).
- If fetching fails it falls back to `sample_docs.json` bundled here.
- Uses TF-IDF + cosine similarity (scikit-learn) to return top matches.

Run

Install requirements (preferably in a virtualenv):

```powershell
python -m pip install -r backend\plagiarism_service\requirements.txt
python -m plagiarism_service
```

Environment variables
- `LIBRARY_SERVICE_URL` (optional): full URL to list library documents. The expected response is JSON list of objects with keys `id`, `title`, `content`.
