import uvicorn
import sys
from pathlib import Path

# Add the parent directory to Python path so quiz_service can be imported as a package
service_dir = Path(__file__).resolve().parent
parent_dir = service_dir.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

if __name__ == "__main__":
    uvicorn.run("quiz_service.main:app", host="0.0.0.0", port=8005, reload=True)

