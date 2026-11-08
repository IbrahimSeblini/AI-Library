# Paraphrase Service

AI-powered paraphrasing microservice using Google Gemini. Rewrites text while preserving meaning.

## Endpoints

- **POST /paraphrase** – Paraphrase text. Body: `{ "text": "..." }`. Returns `{ "paraphrased": "..." }`.
- **GET /health** – Health check.

## Environment

- **GEMINI_API_KEY** (required) – Google Gemini API key.
- **GEMINI_PARAPHRASE_MODEL** (optional) – Model name, default `gemini-2.5-flash`.
- **GEMINI_TEMPERATURE** (optional) – Default `0.5`.
- **GEMINI_MAX_OUTPUT_TOKENS** (optional) – Default `8192`.

## Run

From project root (with venv activated):

```bash
python -m paraphrase_service
```

Runs on port **8120**. The gateway proxies `/api/paraphrase/*` to this service.
