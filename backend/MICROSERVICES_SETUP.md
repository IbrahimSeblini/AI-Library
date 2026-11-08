# Microservices Architecture Setup

This document describes the microservices architecture implementation for IntelliLibrary.

## Architecture Overview

The system now follows a proper microservices architecture with:

1. **Gateway Service** (Port 8000) - API Gateway that routes requests to appropriate services
2. **Auth Service** (Port 8001) - User authentication and authorization
3. **Library Service** (Port 8002) - Paper management and search
4. **Groups Service** (Port 8003) - Study groups and invitations
5. **Quiz Service** (Port 8005) - Quiz generation
6. **Plagiarism Service** (Port 8100) - Plagiarism checking

Each service has its own database and follows the microservice pattern:
```
service_name/
├── app/
│   ├── main.py              # FastAPI app entrypoint
│   ├── api/v1/routes.py    # API endpoints
│   ├── core/config.py       # Settings from env
│   ├── db/
│   │   ├── base.py          # SQLAlchemy Base
│   │   ├── session.py       # Database session
│   │   └── models/           # Database models
│   └── schemas/             # Pydantic models
├── tests/                   # Test suite
└── requirements.txt
```

## Environment Setup

### 1. Gateway Service (.env)
```env
AUTH_SERVICE_URL=http://localhost:8001
LIBRARY_SERVICE_URL=http://localhost:8002
GROUPS_SERVICE_URL=http://localhost:8003
FRONTEND_ORIGINS=*
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_ALG=HS256
```

### 2. Auth Service (.env)
```env
DATABASE_URL=sqlite:///./auth.db
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_ALG=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

### 3. Library Service (.env)
```env
DATABASE_URL=sqlite:///./library.db
```

### 4. Groups Service (.env)
```env
DATABASE_URL=sqlite:///./groups.db
AUTH_SERVICE_URL=http://localhost:8001
```

### 5. Quiz Service (.env)
```env
DATABASE_URL=sqlite:///./quiz.db
```

### 6. Plagiarism Service (.env)
```env
DATABASE_URL=sqlite:///./plagiarism.db
LIBRARY_SERVICE_URL=http://localhost:8002
```

**Important**: The `JWT_SECRET` must match between gateway and auth_service!

## Running the Services

### Start all services:

```bash
# Terminal 1 - Gateway
cd backend/gateway
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload

# Terminal 2 - Auth Service
cd backend/auth_service
pip install -r requirements.txt
python -m auth_service

# Terminal 3 - Library Service
cd backend/library_service
pip install -r requirements.txt
python -m library_service

# Terminal 4 - Groups Service
cd backend/groups_service
pip install -r requirements.txt
python -m groups_service

# Terminal 5 - Quiz Service
cd backend/quiz_service
pip install -r requirements.txt
python -m quiz_service

# Terminal 6 - Plagiarism Service
cd backend/plagiarism_service
pip install -r requirements.txt
python -m plagiarism_service
```

## API Endpoints

### Gateway Routes:
- `/auth/*` → Auth Service
- `/api/papers/*` → Library Service
- `/api/categories` → Library Service
- `/api/groups/*` → Groups Service
- `/api/invitations/*` → Groups Service
- `/api/plagiarism/*` → Plagiarism Service

### Library Service Endpoints:
- `GET /api/v1/papers` - List papers
- `GET /api/v1/papers/{id}` - Get paper by ID
- `POST /api/v1/papers` - Create paper
- `GET /api/v1/papers/search` - Search papers
- `GET /api/v1/papers/recommendations` - Get recommendations
- `GET /api/v1/categories` - Get categories

### Groups Service Endpoints:
- `POST /api/v1/groups` - Create group (requires X-User-Id header)
- `GET /api/v1/groups` - List groups (requires X-User-Id header)
- `GET /api/v1/groups/{id}` - Get group details
- `POST /api/v1/groups/{id}/invitations` - Invite user
- `GET /api/v1/invitations` - Get user invitations
- `POST /api/v1/invitations/{id}/respond` - Accept/decline invitation

### Quiz Service Endpoints:
- `POST /api/v1/quiz` - Create quiz
- `GET /api/v1/quiz` - Get quiz
- `POST /api/v1/quiz/{id}/submit` - Submit quiz
- `GET /api/v1/quiz/{id}/results` - Get quiz results

### Plagiarism Service Endpoints:
- `POST /api/v1/plagiarism` - Submit paper for plagiarism check
- `GET /api/v1/plagiarism/{id}` - Get plagiarism result
- `POST /check` - Check text for plagiarism (proxied via `/api/plagiarism/check`)

## Gateway JWT Validation

The gateway extracts the user ID from JWT tokens and passes it as `X-User-Id` header to services that need authentication. This allows services to identify the user without needing direct access to the auth database.

## Frontend Integration

The frontend (`frontend/services/apiService.ts`) has been updated to:
1. Call real backend APIs via the gateway
2. Fall back to mock data if services are unavailable (for offline demos)
3. Handle authentication tokens automatically

## Testing

Each service has its own test suite:

```bash
# Test Library Service
cd backend/library_service
pytest

# Test Groups Service
cd backend/groups_service
pytest

# Test Auth Service
cd backend/auth_service
pytest
```

## Database Migration

Each service creates its database automatically on first run. For production, consider using:
- PostgreSQL instead of SQLite
- Alembic for migrations
- Separate database instances per service

## Security Notes

1. **JWT Secrets**: Use strong, unique secrets in production
2. **CORS**: Configure `FRONTEND_ORIGINS` properly in production
3. **Database**: Use connection pooling and proper credentials
4. **Rate Limiting**: Consider adding rate limiting to the gateway
5. **HTTPS**: Use HTTPS in production

## Next Steps

1. Add user lookup endpoint in auth service for groups service
2. Implement paper addition to groups
3. Add pagination to list endpoints
4. Add caching layer (Redis)
5. Add monitoring and logging
6. Containerize services with Docker

