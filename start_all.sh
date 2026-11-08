#!/bin/bash

# MyLibraryPal - Start All Services Script
# This script activates the virtual environment and starts all backend services + frontend

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_PATH="$BACKEND_DIR/venv"

# PID file to track running processes (format: service_name:pid)
PID_FILE="$SCRIPT_DIR/.service_pids"

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Stopping all services...${NC}"
    if [ -f "$PID_FILE" ]; then
        while IFS=':' read -r service_name pid; do
            if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
                kill "$pid" 2>/dev/null || true
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi
    # Also kill any remaining uvicorn processes
    pkill -f "uvicorn.*main:app" 2>/dev/null || true
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

# Trap Ctrl+C and cleanup
trap cleanup SIGINT SIGTERM

# Kill any existing processes on service ports
echo -e "${YELLOW}Killing any existing processes on service ports...${NC}"
for port in 8000 8001 8002 8003 8004 8005 8100 8110 8120 8125 8130 8200 8210 3000; do
    lsof -ti:$port 2>/dev/null | xargs kill -9 2>/dev/null || true
done
pkill -9 -f uvicorn 2>/dev/null || true

# Check if venv exists
if [ ! -d "$VENV_PATH" ]; then
    echo -e "${RED}Error: Virtual environment not found at $VENV_PATH${NC}"
    echo "Please create the virtual environment first:"
    echo "  cd $BACKEND_DIR && python3 -m venv venv"
    exit 1
fi

# Activate virtual environment
echo -e "${GREEN}Activating virtual environment...${NC}"
source "$VENV_PATH/bin/activate"

# Get venv python path
VENV_PYTHON="$VENV_PATH/bin/python"

# Verify Python is working
if [ ! -f "$VENV_PYTHON" ]; then
    echo -e "${RED}Error: Python not found at $VENV_PYTHON${NC}"
    exit 1
fi

# Check if frontend node_modules exists
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${YELLOW}Frontend node_modules not found. Installing dependencies...${NC}"
    cd "$FRONTEND_DIR"
    npm install
    cd "$SCRIPT_DIR"
fi

# Function to install service dependencies
install_service_deps() {
    local service_name=$1
    local service_dir="$BACKEND_DIR/$service_name"
    
    if [ -f "$service_dir/requirements.txt" ]; then
        echo -e "${YELLOW}Installing dependencies for $service_name...${NC}"
        "$VENV_PYTHON" -m pip install -q -r "$service_dir/requirements.txt" || {
            echo -e "${RED}Failed to install dependencies for $service_name${NC}"
            return 1
        }
    fi
}

# Install all service dependencies
echo -e "${GREEN}Installing/updating service dependencies...${NC}"
install_service_deps "gateway"
install_service_deps "auth_service"
install_service_deps "library_service"
install_service_deps "groups_service"
install_service_deps "librarian_service"
install_service_deps "quiz_service"
install_service_deps "plagiarism_service"
install_service_deps "summary_service"
install_service_deps "paraphrase_service"
install_service_deps "counterarguments_service"
install_service_deps "roadmap_service"
install_service_deps "friends_service"
install_service_deps "study_tracker_service"

# Clear previous PID file
rm -f "$PID_FILE"

# Create logs directory
mkdir -p "$SCRIPT_DIR/logs"

# Function to start a service
start_service() {
    local service_name=$1
    local port=$2
    local working_dir="${3:-$BACKEND_DIR}"
    local log_file="$SCRIPT_DIR/logs/${service_name}.log"
    
    echo -e "${GREEN}Starting $service_name on port $port...${NC}"

    # Start the service in a subshell with venv on PATH
    (
        # Set PATH to include venv bin directory
        export PATH="$VENV_PATH/bin:$PATH"
        export VIRTUAL_ENV="$VENV_PATH"

        case "$service_name" in
            "gateway")
                cd "$BACKEND_DIR/gateway"
                "$VENV_PYTHON" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
                ;;
            "auth_service")
                cd "$BACKEND_DIR"
                "$VENV_PYTHON" -m auth_service
                ;;
            "library_service")
                cd "$BACKEND_DIR"
                "$VENV_PYTHON" -m library_service
                ;;
            "groups_service")
                cd "$BACKEND_DIR"
                "$VENV_PYTHON" -m groups_service
                ;;
            "librarian_service")
                cd "$BACKEND_DIR"
                "$VENV_PYTHON" -m librarian_service
                ;;
            "quiz_service")
                cd "$BACKEND_DIR"
                "$VENV_PYTHON" -m quiz_service
                ;;
            "plagiarism_service")
                cd "$BACKEND_DIR"
                "$VENV_PYTHON" -m plagiarism_service
                ;;
            "summary_service")
                cd "$BACKEND_DIR"
                "$VENV_PYTHON" -m summary_service
                ;;
            "paraphrase_service")
                cd "$BACKEND_DIR"
                "$VENV_PYTHON" -m paraphrase_service
                ;;
            "counterarguments_service")
                cd "$BACKEND_DIR"
                "$VENV_PYTHON" -m counterarguments_service
                ;;
            "roadmap_service")
                cd "$BACKEND_DIR"
                "$VENV_PYTHON" -m roadmap_service
                ;;
            "friends_service")
                cd "$BACKEND_DIR"
                "$VENV_PYTHON" -m friends_service
                ;;
            "study_tracker_service")
                cd "$BACKEND_DIR"
                "$VENV_PYTHON" -m study_tracker_service
                ;;
            *)
                echo "Unknown service: $service_name" >&2
                exit 1
                ;;
        esac
    ) > "$log_file" 2>&1 &
    
    local pid=$!
    echo "${service_name}:${pid}" >> "$PID_FILE"
    echo -e "${GREEN}  ✓ $service_name started (PID: $pid)${NC}"
    
    # Wait a bit and check if it's still running
    sleep 2
    if ! ps -p "$pid" > /dev/null 2>&1; then
        echo -e "${RED}  ✗ $service_name failed to start! Check $log_file${NC}"
        tail -20 "$log_file" | sed 's/^/    /'
        return 1
    fi
    
    return 0
}

# Start all backend services
echo -e "\n${GREEN}=== Starting Backend Services ===${NC}"

# Gateway (Port 8000)
start_service "gateway" "8000"

# Auth Service (Port 8001)
start_service "auth_service" "8001"

# Library Service (Port 8002)
start_service "library_service" "8002"

# Groups Service (Port 8003)
start_service "groups_service" "8003"

# Librarian Service (Port 8004)
start_service "librarian_service" "8004"

# Quiz Service (Port 8005)
start_service "quiz_service" "8005"

# Plagiarism Service (Port 8100)
start_service "plagiarism_service" "8100"

# Summary Service (Port 8110)
start_service "summary_service" "8110"

# Paraphrase Service (Port 8120)
start_service "paraphrase_service" "8120"

# Counterarguments Service (Port 8125)
start_service "counterarguments_service" "8125"

# Roadmap Service (Port 8130)
start_service "roadmap_service" "8130"

# Friends Service (Port 8200)
start_service "friends_service" "8200"

# Study Tracker Service (Port 8210)
start_service "study_tracker_service" "8210"

# Start frontend
echo -e "\n${GREEN}=== Starting Frontend ===${NC}"
cd "$FRONTEND_DIR"
npm run dev > "$SCRIPT_DIR/logs/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "frontend:${FRONTEND_PID}" >> "$PID_FILE"
echo -e "${GREEN}  ✓ Frontend started (PID: $FRONTEND_PID)${NC}"

# Wait a bit for services to start
echo -e "\n${YELLOW}Waiting for services to initialize...${NC}"
sleep 5

# Check service health
echo -e "\n${GREEN}=== Checking Service Health ===${NC}"
failed_services=()
while IFS=':' read -r service_name pid; do
    if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
        echo -e "${GREEN}  ✓ $service_name is running (PID: $pid)${NC}"
    else
        echo -e "${RED}  ✗ $service_name is not running${NC}"
        failed_services+=("$service_name")
    fi
done < "$PID_FILE"

if [ ${#failed_services[@]} -gt 0 ]; then
    echo -e "\n${RED}Some services failed to start. Check logs:${NC}"
    for service in "${failed_services[@]}"; do
        echo -e "${YELLOW}  - logs/${service}.log${NC}"
    done
fi

# Display service status
echo -e "\n${GREEN}=== Service URLs ===${NC}"
echo "  - Frontend:        http://localhost:3000 (or check logs for actual port)"
echo "  - API Gateway:     http://localhost:8000"
echo "  - Auth Service:    http://localhost:8001"
echo "  - Library Service: http://localhost:8002"
echo "  - Groups Service:  http://localhost:8003"
echo "  - Librarian:       http://localhost:8004"
echo "  - Quiz Service:    http://localhost:8005"
echo "  - Plagiarism:      http://localhost:8100"
echo "  - Summary:         http://localhost:8110"
echo "  - Paraphrase:      http://localhost:8120"
echo "  - Counter:         http://localhost:8125"
echo "  - Roadmap:         http://localhost:8130"
echo "  - Friends:         http://localhost:8200"
echo "  - Study Tracker:   http://localhost:8210"
echo ""
echo -e "${YELLOW}Logs are being written to: $SCRIPT_DIR/logs/${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Keep script running and monitor services
last_warning_time=0
while true; do
    sleep 10
    current_time=$(date +%s)
    
    # Check if any service died (only warn once per minute)
    if [ -f "$PID_FILE" ] && [ $((current_time - last_warning_time)) -gt 60 ]; then
        while IFS=':' read -r service_name pid; do
            if [ -n "$pid" ] && [ -n "$service_name" ] && ! ps -p "$pid" > /dev/null 2>&1; then
                echo -e "${RED}⚠️  Service '$service_name' (PID: $pid) has stopped. Check logs/${service_name}.log for errors${NC}"
                last_warning_time=$current_time
            fi
        done < "$PID_FILE"
    fi
done
