<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1mnkgGt9u-vKIVZd5wF1QES1Q5qwS9B8j

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set:
   - `VITE_API_BASE_URL` (e.g. `http://localhost:8000` where the gateway runs)
   - `GEMINI_API_KEY` (your Gemini key)
3. Start backend services (PowerShell examples):
   ```powershell
   # Auth service (example port 8001)
   uvicorn auth_service.main:app --port 8001 --reload
   # Main backend (if applicable, adjust port 8002)
   # uvicorn some_backend.main:app --port 8002 --reload
   # Gateway (proxies /auth and /api)
   uvicorn gateway.main:app --port 8000 --reload
   ```
4. Run the frontend:
   `npm run dev`
5. Open the app and sign up / log in. The frontend will attempt real gateway calls; if unreachable it falls back to local mock storage for demo use.

### Notes
The service layer in `services/apiService.ts` first tries the gateway endpoints (`/auth/register`, `/auth/login`, `/auth/me`). On network failure it gracefully falls back to local storage mocks so you can still demo UI features offline.
