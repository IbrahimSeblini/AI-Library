# Commands to Start All Services

## 0. (Optional) Seed the library with sample papers

The library starts **empty**. To add sample papers for testing:

```bash
# From project root
python seed_library.py
```

See **SEED_LIBRARY.md** for details.

---

## 1. Activate Virtual Environment

```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend
source venv/bin/activate
```

## 2. Start Backend Services

Open **separate terminal windows/tabs** for each service:

### Auth Service (Port 8001)
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend
source venv/bin/activate
python -m auth_service
```

### Library Service (Port 8002)
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend
source venv/bin/activate
python -m library_service
```

### Groups Service (Port 8003)
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend
source venv/bin/activate
python -m groups_service
```

### Librarian Service (Port 8004)
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend
source venv/bin/activate
python -m librarian_service
```

### Quiz Service (Port 8005)
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend
source venv/bin/activate
python -m quiz_service
```

### Plagiarism Service (Port 8100)
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend
source venv/bin/activate
python -m plagiarism_service
```

### API Gateway (Port 8000)
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend
source venv/bin/activate
cd gateway
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## 3. Start Frontend

```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/frontend
npm run dev
```

---

## Quick Reference - All Commands in One Place

**Terminal 1 - Auth Service:**
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend && source venv/bin/activate && python -m auth_service
```

**Terminal 2 - Library Service:**
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend && source venv/bin/activate && python -m library_service
```

**Terminal 3 - Groups Service:**
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend && source venv/bin/activate && python -m groups_service
```

**Terminal 4 - Librarian Service:**
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend && source venv/bin/activate && python -m librarian_service
```

**Terminal 5 - Quiz Service:**
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend && source venv/bin/activate && python -m quiz_service
```

**Terminal 6 - Plagiarism Service:**
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend && source venv/bin/activate && python -m plagiarism_service
```

**Terminal 7 - API Gateway:**
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/backend && source venv/bin/activate && cd gateway && uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 8 - Frontend:**
```bash
cd /Users/karimassi/Desktop/FYP_git/FYP/intellilibrary_-ai-powered-library-management/frontend && npm run dev
```

---

## Service URLs

- **Frontend**: http://localhost:5173 (or the port Vite assigns)
- **API Gateway**: http://localhost:8000
- **Auth Service**: http://localhost:8001
- **Library Service**: http://localhost:8002
- **Groups Service**: http://localhost:8003
- **Librarian Service**: http://localhost:8004
- **Quiz Service**: http://localhost:8005
- **Plagiarism Service**: http://localhost:8100

---

## Notes

- Make sure you have the virtual environment activated before running any backend service
- Each service should run in its own terminal window/tab
- The services use `--reload` flag, so they will auto-reload on code changes
- Make sure you have set the `GEMINI_API_KEY` environment variable for the librarian service to work properly


