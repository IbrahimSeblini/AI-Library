#!/bin/bash
# Simple script to run the librarian service
cd "$(dirname "$0")"
uvicorn app.main:app --reload --port 8004 --host 0.0.0.0

