import uvicorn

if __name__ == "__main__":
    uvicorn.run("roadmap_service.main:app", host="127.0.0.1", port=8130, reload=True)
