#!/bin/bash

# MyLibraryPal - Stop All Services Script

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PID_FILE="$SCRIPT_DIR/.service_pids"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Stopping all services...${NC}"

if [ -f "$PID_FILE" ]; then
    while IFS=':' read -r service_name pid; do
        if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
            echo "Stopping $service_name (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
        fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
    echo -e "${GREEN}All services stopped.${NC}"
else
    echo "No running services found (PID file not found)."
fi

# Kill any remaining processes by name (fallback for all services)
pkill -f "uvicorn.*main:app" 2>/dev/null || true
pkill -f "python.*auth_service" 2>/dev/null || true
pkill -f "python.*library_service" 2>/dev/null || true
pkill -f "python.*groups_service" 2>/dev/null || true
pkill -f "python.*librarian_service" 2>/dev/null || true
pkill -f "python.*quiz_service" 2>/dev/null || true
pkill -f "python.*plagiarism_service" 2>/dev/null || true
pkill -f "python.*summary_service" 2>/dev/null || true
pkill -f "python.*paraphrase_service" 2>/dev/null || true
pkill -f "python.*roadmap_service" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

echo -e "${GREEN}Cleanup complete.${NC}"




