#!/usr/bin/env python
"""Entry point for running the librarian service."""
import sys
from pathlib import Path

# Add the parent directory to path so we can import the app
service_dir = Path(__file__).resolve().parent
if str(service_dir) not in sys.path:
    sys.path.insert(0, str(service_dir))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8004, reload=True)

