"""Allow running with `python -m friends_service`."""
import uvicorn

uvicorn.run("friends_service.main:app", host="0.0.0.0", port=8200, reload=True)
