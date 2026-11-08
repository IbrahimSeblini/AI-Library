# Friends & Reading Activity Service

Microservice for tracking friendships (follow/unfollow) and reading activity. Provides a social feed showing friends' reading behaviour and aggregated insights.

## User Story
> As a user, I want insights into what friends are reading.

## Running

```bash
cd backend
pip install -r friends_service/requirements.txt
python -m friends_service
```

The service runs on **port 8003** by default.

## Endpoints

### Friends
| Method | Path | Description |
|--------|------|-------------|
| POST | `/friends/follow` | Follow a user |
| DELETE | `/friends/unfollow/{user_id}` | Unfollow a user |
| GET | `/friends/` | List users you follow |
| GET | `/friends/followers/count` | Get follower/following counts |
| GET | `/friends/check/{user_id}` | Check if following a user |

### Activity
| Method | Path | Description |
|--------|------|-------------|
| POST | `/activity/` | Log a reading event |
| GET | `/activity/feed` | Friends' reading feed (paginated) |
| GET | `/activity/my` | Your own reading history |
| GET | `/activity/insights` | Trending papers & most active readers |

## Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `changeme` | Must match auth_service |
| `FRIENDS_DATABASE_URL` | `sqlite:///friends.db` | Database URL |
| `AUTH_SERVICE_URL` | `http://localhost:8001` | Auth service for user lookups |
