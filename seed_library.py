#!/usr/bin/env python3
"""
Seed the library with sample papers so you can test the app.
Run from project root: python seed_library.py
"""

import sys
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR / "backend"
VENV_PATH = BACKEND_DIR / "venv"
LIBRARY_SERVICE_DIR = BACKEND_DIR / "library_service"


def get_venv_python():
    if sys.platform == "win32":
        return VENV_PATH / "Scripts" / "python.exe"
    return VENV_PATH / "bin" / "python"


def main():
    if not VENV_PATH.exists():
        print("Virtual environment not found. Create it first:")
        print(f"   cd {BACKEND_DIR}")
        print("   python -m venv venv")
        print("   pip install -r library_service/requirements.txt")
        sys.exit(1)

    python = get_venv_python()
    if not python.exists():
        print(f"venv Python not found at {python}")
        sys.exit(1)

    print("Seeding library with sample papers...")
    result = subprocess.run(
        [str(python), "seed_data.py"],
        cwd=str(LIBRARY_SERVICE_DIR),
    )
    if result.returncode != 0:
        print("Seed failed.")
        sys.exit(result.returncode)
    print("Done. Start the app (e.g. python start_all.py) and open the library.")


if __name__ == "__main__":
    main()
