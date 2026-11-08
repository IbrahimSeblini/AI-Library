import uvicorn
import sys
from pathlib import Path

# Add the service directory to Python path
service_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(service_dir))

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8003, reload=True)

