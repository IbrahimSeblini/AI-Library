# Library Service

Microservice for managing papers and library content.

## Quick Start

1. Create a `.env` file:
   ```
   DATABASE_URL=sqlite:///./library.db
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the service:
   ```bash
   python -m library_service
   # or
   uvicorn app.main:app --reload --port 8002
   ```

## Seeding sample papers

To populate the library with sample papers for local testing:

```bash
# From project root
python seed_library.py
```

See **SEED_LIBRARY.md** in the project root for details.

## Endpoints

- `GET /health` - Health check
- `GET /api/v1/papers` - List all papers
- `GET /api/v1/papers/{paper_id}` - Get paper by ID
- `POST /api/v1/papers` - Create new paper
- `GET /api/v1/papers/search` - Search papers with filters
- `GET /api/v1/papers/recommendations` - Get recommended papers
- `GET /api/v1/categories` - Get all categories/subjects

