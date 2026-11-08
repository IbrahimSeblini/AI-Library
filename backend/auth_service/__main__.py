import uvicorn

if __name__ == "__main__":
    # Run the FastAPI app with reload for development
    # Use a string import path so reload works reliably
    uvicorn.run("auth_service.main:app", host="127.0.0.1", port=8001, reload=True)
