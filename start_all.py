#!/usr/bin/env python3
"""
MyLibraryPal - Start All Services Script (Python version)
This script activates the virtual environment and starts all backend services + frontend
"""

import os
import sys
import subprocess
import signal
import time
from pathlib import Path

# Get script directory
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR / "backend"
FRONTEND_DIR = SCRIPT_DIR / "frontend"
FRONTEND_JUDGE_DIR = SCRIPT_DIR / "frontend-judge"
VENV_PATH = BACKEND_DIR / "venv"
LOGS_DIR = SCRIPT_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)

# Store (service_name, process) for each started service
processes = []  # list of (name, proc)

def cleanup(signum=None, frame=None):
    """Stop all running processes"""
    print("\n🛑 Stopping all services...")
    for _name, proc in processes:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except (subprocess.TimeoutExpired, ProcessLookupError):
            try:
                proc.kill()
            except:
                pass
    print("✅ All services stopped.")
    sys.exit(0)

# Register signal handlers
signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

def check_venv():
    """Check if virtual environment exists"""
    if not VENV_PATH.exists():
        print("❌ Error: Virtual environment not found!")
        print(f"   Please create it: cd {BACKEND_DIR} && python3 -m venv venv")
        sys.exit(1)

def get_venv_python():
    """Get the Python executable from venv"""
    if sys.platform == "win32":
        return VENV_PATH / "Scripts" / "python.exe"
    else:
        return VENV_PATH / "bin" / "python"

def get_venv_activate():
    """Get the activation script path"""
    if sys.platform == "win32":
        return VENV_PATH / "Scripts" / "activate"
    else:
        return VENV_PATH / "bin" / "activate"

def _kill_port(port: str) -> None:
    """Kill any process listening on the given port so restarts don't hit [Errno 48]."""
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True, text=True
        )
        pids = [p for p in result.stdout.strip().split() if p]
        for pid in pids:
            try:
                subprocess.run(["kill", "-9", pid], capture_output=True)
            except Exception:
                pass
        if pids:
            time.sleep(0.5)
    except Exception:
        pass


def start_service(name, command, port, cwd=None):
    """Start a service and return the process"""
    _kill_port(str(port))
    print(f"🚀 Starting {name} on port {port}...")

    log_file = LOGS_DIR / f"{name}.log"
    
    if cwd:
        working_dir = Path(cwd)
    else:
        working_dir = BACKEND_DIR
    
    # Open log file
    log_handle = open(log_file, "w")
    
    # Start process
    if isinstance(command, list):
        proc = subprocess.Popen(
            command,
            cwd=str(working_dir),
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            env=dict(os.environ, **{"VIRTUAL_ENV": str(VENV_PATH)})
        )
    else:
        # For shell commands
        proc = subprocess.Popen(
            command,
            shell=True,
            cwd=str(working_dir),
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            env=dict(os.environ, **{"VIRTUAL_ENV": str(VENV_PATH)})
        )
    
    processes.append((name, proc))
    print(f"   ✓ {name} started (PID: {proc.pid})")
    time.sleep(1)  # Give service time to start
    return proc

def main():
    """Main function"""
    print("=" * 60)
    print("🎵 MyLibraryPal - Starting All Services")
    print("=" * 60)
    
    # Check venv
    check_venv()
    venv_python = get_venv_python()
    
    # Check frontend dependencies
    if not (FRONTEND_DIR / "node_modules").exists():
        print("📦 Installing frontend dependencies...")
        subprocess.run(["npm", "install"], cwd=str(FRONTEND_DIR), check=True)
    
    print("\n" + "=" * 60)
    print("🔧 Starting Backend Services")
    print("=" * 60)
    
    # Start Gateway
    start_service(
        "gateway",
        [str(venv_python), "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
        "8000",
        cwd=BACKEND_DIR / "gateway"
    )
    
    # Start Auth Service
    start_service(
        "auth_service",
        [str(venv_python), "-m", "auth_service"],
        "8001"
    )
    
    # Start Library Service
    start_service(
        "library_service",
        [str(venv_python), "-m", "library_service"],
        "8002"
    )
    
    # Start Groups Service
    start_service(
        "groups_service",
        [str(venv_python), "-m", "groups_service"],
        "8003"
    )
    
    # Start Librarian Service
    start_service(
        "librarian_service",
        [str(venv_python), "-m", "librarian_service"],
        "8004"
    )
    
    # Start Quiz Service
    start_service(
        "quiz_service",
        [str(venv_python), "-m", "quiz_service"],
        "8005"
    )

    # Start Course Service
    start_service(
        "course_service",
        [str(venv_python), "-m", "course_service"],
        "8006"
    )
    
    # Start Plagiarism Service
    start_service(
        "plagiarism_service",
        [str(venv_python), "-m", "plagiarism_service"],
        "8100"
    )
    
    # Start Summary Service
    start_service(
        "summary_service",
        [str(venv_python), "-m", "summary_service"],
        "8110"
    )
    
    # Start Paraphrase Service
    start_service(
        "paraphrase_service",
        [str(venv_python), "-m", "paraphrase_service"],
        "8120"
    )

    # Start Counterarguments Service
    start_service(
        "counterarguments_service",
        [str(venv_python), "-m", "counterarguments_service"],
        "8125"
    )

    # Start Roadmap Service
    start_service(
        "roadmap_service",
        [str(venv_python), "-m", "roadmap_service"],
        "8130"
    )

    # Start Friends Service
    start_service(
        "friends_service",
        [str(venv_python), "-m", "friends_service"],
        "8200"
    )

    # Start Study Tracker Service
    start_service(
        "study_tracker_service",
        [str(venv_python), "-m", "study_tracker_service"],
        "8210"
    )

    # Start Judge Service
    start_service(
        "judge_service",
        [str(venv_python), "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8140", "--reload"],
        "8140",
        cwd=BACKEND_DIR / "judge_service"
    )

    print("\n" + "=" * 60)
    print("🎨 Starting Frontends")
    print("=" * 60)

    # Check frontend-judge dependencies
    if not (FRONTEND_JUDGE_DIR / "node_modules").exists():
        print("📦 Installing frontend-judge dependencies...")
        subprocess.run(["npm", "install"], cwd=str(FRONTEND_JUDGE_DIR), check=True)

    # Start main frontend
    frontend_log = LOGS_DIR / "frontend.log"
    with open(frontend_log, "w") as f:
        frontend_proc = subprocess.Popen(
            "npm run dev",
            shell=True,
            cwd=str(FRONTEND_DIR),
            stdout=f,
            stderr=subprocess.STDOUT
        )
    processes.append(("frontend", frontend_proc))
    print(f"   ✓ Frontend (main) started (PID: {frontend_proc.pid})")

    # Start judge dashboard frontend
    frontend_judge_log = LOGS_DIR / "frontend-judge.log"
    with open(frontend_judge_log, "w") as f:
        frontend_judge_proc = subprocess.Popen(
            "npm run dev",
            shell=True,
            cwd=str(FRONTEND_JUDGE_DIR),
            stdout=f,
            stderr=subprocess.STDOUT
        )
    processes.append(("frontend-judge", frontend_judge_proc))
    print(f"   ✓ Frontend (judge dashboard) started (PID: {frontend_judge_proc.pid})")
    
    # Wait for services to initialize
    print("\n⏳ Waiting for services to initialize...")
    time.sleep(3)
    
    # Display status
    print("\n" + "=" * 60)
    print("✅ All Services Started!")
    print("=" * 60)
    print("\n📍 Service URLs:")
    print("   - Frontend:        http://localhost:3000 (or check logs)")
    print("   - API Gateway:     http://localhost:8000")
    print("   - Auth Service:   http://localhost:8001")
    print("   - Library:        http://localhost:8002")
    print("   - Groups:         http://localhost:8003")
    print("   - Librarian:      http://localhost:8004")
    print("   - Quiz:           http://localhost:8005")
    print("   - Courses:        http://localhost:8006")
    print("   - Plagiarism:     http://localhost:8100")
    print("   - Summary:        http://localhost:8110")
    print("   - Paraphrase:     http://localhost:8120")
    print("   - Counter:        http://localhost:8125")
    print("   - Roadmap:        http://localhost:8130")
    print("   - Friends:        http://localhost:8200")
    print("   - Study Tracker:  http://localhost:8210")
    print("   - Judge Service:  http://localhost:8140")
    print("   - Judge Dashboard:http://localhost:5174")
    print(f"\n📋 Logs: {LOGS_DIR}")
    print("\n⚠️  Press Ctrl+C to stop all services")
    print("=" * 60)
    
    # Keep running; auto-restart backend services that die (frontend processes are not restarted)
    NO_RESTART = {"frontend", "frontend-judge"}
    dead_reported: set[int] = set()  # PIDs of non-restartable processes already warned
    # Map name → (command, port, cwd) for restart
    service_configs = {}
    for svc_name, svc_cmd, svc_port, svc_cwd in [
        ("gateway", [str(venv_python), "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"], "8000", BACKEND_DIR / "gateway"),
        ("auth_service",           [str(venv_python), "-m", "auth_service"],           "8001", None),
        ("library_service",        [str(venv_python), "-m", "library_service"],         "8002", None),
        ("groups_service",         [str(venv_python), "-m", "groups_service"],          "8003", None),
        ("librarian_service",      [str(venv_python), "-m", "librarian_service"],       "8004", None),
        ("quiz_service",           [str(venv_python), "-m", "quiz_service"],            "8005", None),
        ("course_service",         [str(venv_python), "-m", "course_service"],          "8006", None),
        ("plagiarism_service",     [str(venv_python), "-m", "plagiarism_service"],      "8100", None),
        ("summary_service",        [str(venv_python), "-m", "summary_service"],         "8110", None),
        ("paraphrase_service",     [str(venv_python), "-m", "paraphrase_service"],      "8120", None),
        ("counterarguments_service",[str(venv_python), "-m", "counterarguments_service"],"8125", None),
        ("roadmap_service",        [str(venv_python), "-m", "roadmap_service"],         "8130", None),
        ("friends_service",        [str(venv_python), "-m", "friends_service"],         "8200", None),
        ("study_tracker_service",  [str(venv_python), "-m", "study_tracker_service"],   "8210", None),
        ("judge_service", [str(venv_python), "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8140", "--reload"], "8140", BACKEND_DIR / "judge_service"),
    ]:
        service_configs[svc_name] = (svc_cmd, svc_port, svc_cwd)

    try:
        while True:
            time.sleep(5)
            for i, (name, proc) in enumerate(processes):
                if proc.poll() is None:
                    continue  # still running
                log_file = LOGS_DIR / f"{name}.log"
                if name in NO_RESTART:
                    if proc.pid not in dead_reported:
                        dead_reported.add(proc.pid)
                        print(f"⚠️  {name} (PID: {proc.pid}) has stopped. Check log: {log_file}")
                    continue
                print(f"🔄 {name} (PID: {proc.pid}) stopped — restarting... (log: {log_file})")
                cfg = service_configs.get(name)
                if cfg:
                    new_proc = start_service(name, cfg[0], cfg[1], cwd=cfg[2])
                    processes[i] = (name, new_proc)
    except KeyboardInterrupt:
        cleanup()

if __name__ == "__main__":
    main()



