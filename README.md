# AI Library

A full-stack library application with AI features, built with a Python backend and web frontends.

## Description

This project was developed as a university project. AI Library is a multi-service application made up of a backend API, a main frontend for users, and a separate judge frontend. It uses Google Vertex AI for its AI functionality, and it comes with a script that seeds the library with starting data.

## What It Does

- Provides a backend service that handles the library data and AI requests
- Offers a web frontend where users interact with the library
- Includes a separate judge frontend (`frontend-judge`) for reviewing and evaluating results
- Populates the library with sample data using `seed_library.py`
- Starts and stops all services together with a single script

## Project Structure

```
AI-Library/
├── backend/           # Backend API (Python)
├── frontend/          # Main user interface
├── frontend-judge/    # Judge / evaluation interface
├── docs/              # Project documentation
├── scripts/           # Helper scripts
├── seed_library.py    # Seeds the library with initial data
├── start_all.sh       # Starts all services (Linux/macOS)
├── start_all.py       # Starts all services (cross-platform)
├── stop_all.sh        # Stops all services
├── check_services.sh  # Checks that services are running
└── requirements.txt   # Python dependencies
```

## Technologies

- Python
- Node.js / JavaScript
- Google Vertex AI

## How to Run

```bash
git clone https://github.com/IbrahimSeblini/AI-Library.git
cd AI-Library

# Install Python dependencies
pip install -r requirements.txt

# Start all services
./start_all.sh
```

On Windows, run `python start_all.py` instead. To stop everything, run `./stop_all.sh`. See `START_ALL_SERVICES.md` for more detail.

## Author

Ibrahim Seblini
