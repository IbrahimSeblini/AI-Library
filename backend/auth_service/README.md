# Auth microservice

This folder contains a minimal Auth microservice (FastAPI) with its own SQLite database by default.

Quick start (from this folder):

1. Create a `.env` file (copy from `.env.example`) and set a strong `JWT_SECRET`.
2. Install dependencies:

   pip install -r requirements.txt

3. Run the service (choose ONE method):

   a) Preferred (module mode avoids relative import issues):

      python -m auth_service  # runs uvicorn with reload on 127.0.0.1:8001

   b) Direct with uvicorn specifying package path:

      uvicorn auth_service.main:app --reload --port 8001

   c) (Old style, may fail with relative import error if run from inside package):

      uvicorn main:app --reload --port 8001

Environment activation on Windows PowerShell (from this folder):

   .\auth_venv\Scripts\Activate.ps1

Then install deps and run one of the commands above.

Endpoints:
- POST /auth/register -> register new user (email, password, full_name)
- POST /auth/login -> login and receive access_token
- GET /auth/me -> returns current user info (requires Bearer token)
