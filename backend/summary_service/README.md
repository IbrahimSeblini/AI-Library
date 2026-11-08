# Summary Service

Generates AI summaries of any input text. Users choose **small**, **medium**, or **large** length.

## Endpoints

- `POST /summarize` — Request body: `{ "text": string, "size": "small" | "medium" | "large" }`. Returns `{ "summary": string, "size": string }`.
- `GET /health` — Health check.

## Environment

- `GEMINI_API_KEY` (required) — Used for summarization.
- `SUMMARY_SERVICE_URL` — Set in gateway when deploying elsewhere (default: `http://localhost:8110`).

## Run locally

```bash
cd backend
source venv/bin/activate   # or .\venv\Scripts\Activate.ps1 on Windows
pip install -r summary_service/requirements.txt
python -m summary_service
```

Service runs on **port 8110**.
