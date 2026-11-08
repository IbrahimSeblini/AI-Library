# Gateway (API proxy)

This small FastAPI-based gateway routes frontend calls to the appropriate backend services.

Routes:
- /auth/* -> forwarded to AUTH_SERVICE_URL (default http://localhost:8001)
- /api/*  -> forwarded to BACKEND_URL (default http://localhost:8002)

Environment variables:
- AUTH_SERVICE_URL: target base URL for auth service (default http://localhost:8001)
- BACKEND_URL: target base URL for main backend (default http://localhost:8002)
- FRONTEND_ORIGINS: comma-separated list of allowed origins for CORS, or `*` (default `*`)

Quick run (PowerShell):

```powershell
# create venv and activate (optional)
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# set environment variables (example)
$env:AUTH_SERVICE_URL = 'http://localhost:8001'
$env:BACKEND_URL = 'http://localhost:8002'
$env:FRONTEND_ORIGINS = '*'

# run gateway on port 8000
uvicorn gateway.main:app --host 0.0.0.0 --port 8000 --reload
```

Notes:
- The gateway is intentionally minimal. It forwards headers and body; it does not alter auth tokens or perform additional security checks. Consider adding auth, rate-limiting, logging, or service discovery in production.
