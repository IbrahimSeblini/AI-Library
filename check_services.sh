#!/bin/bash

# Quick health check for all services

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "Checking service health..."

services=(
    "http://localhost:8000/health:Gateway"
    "http://localhost:8001/health:Auth Service"
    "http://localhost:8002/health:Library Service"
    "http://localhost:8003/health:Groups Service"
    "http://localhost:8004/health:Librarian Service"
    "http://localhost:8005/health:Quiz Service"
    "http://localhost:8100/health:Plagiarism Service"
)

for service in "${services[@]}"; do
    url="${service%%:*}"
    name="${service##*:}"
    if curl -s -f "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ $name is running${NC}"
    else
        echo -e "${RED}✗ $name is not responding${NC}"
    fi
done




