from .main import app
import uvicorn


if __name__ == "__main__":
    uvicorn.run("plagiarism_service.main:app", host="0.0.0.0", port=8100, reload=False)
