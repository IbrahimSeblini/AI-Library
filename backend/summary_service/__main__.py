import sys
from pathlib import Path

import uvicorn

service_dir = Path(__file__).resolve().parent
parent_dir = service_dir.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

if __name__ == "__main__":
    uvicorn.run("summary_service.main:app", host="0.0.0.0", port=8110, reload=True)
