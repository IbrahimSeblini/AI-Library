"""Allow running with `python -m study_tracker_service`."""
import uvicorn

uvicorn.run("study_tracker_service.main:app", host="0.0.0.0", port=8210, reload=True)
