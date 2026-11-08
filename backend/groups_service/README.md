# Groups Service

Microservice for managing study groups, invitations, and group papers.

## Quick Start

1. Create a `.env` file:
   ```
   DATABASE_URL=sqlite:///./groups.db
   AUTH_SERVICE_URL=http://localhost:8001
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the service:
   ```bash
   python -m groups_service
   # or
   uvicorn app.main:app --reload --port 8003
   ```

## Endpoints

- `GET /health` - Health check
- `POST /api/v1/groups` - Create a new group
- `GET /api/v1/groups` - List groups (user's groups + public groups)
- `GET /api/v1/groups/{group_id}` - Get group details
- `POST /api/v1/groups/{group_id}/invitations` - Invite user to group
- `GET /api/v1/invitations` - Get user's pending invitations
- `POST /api/v1/invitations/{invitation_id}/respond` - Accept/decline invitation

