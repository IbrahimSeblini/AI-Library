# Study Tracker Service

Microservice for tracking weekly study time across all IntelliLibrary activities.

## User Story
> As a student, I want to track how much time I spend studying weekly.

## Running

```bash
cd backend
pip install -r study_tracker_service/requirements.txt
python -m study_tracker_service
```

The service runs on **port 8004** by default.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/tracker/sessions/start` | Start a new study session (auto-closes previous) |
| POST | `/tracker/sessions/end` | End the current open session |
| GET | `/tracker/sessions/current` | Get the currently active session |
| GET | `/tracker/sessions/history` | Recent sessions (paginated) |
| GET | `/tracker/weekly?week_offset=0` | Weekly summary with breakdowns |

## Weekly Summary includes
- **Total study time** for the week
- **By activity**: reading, chatbot, groups, plagiarism, home
- **By category**: within reading, time per subject (e.g. Machine Learning, Quantum Physics)
- **Daily totals**: Mon–Sun for chart rendering

## Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `changeme` | Must match auth_service |
| `TRACKER_DATABASE_URL` | `sqlite:///study_tracker.db` | Database URL |
