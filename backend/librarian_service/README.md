# Librarian Service

Microservice for the virtual librarian chatbot with conversation memory and RAG (Retrieval Augmented Generation).

## Quick Start

1. Create a `.env` file:
   ```
   DATABASE_URL=sqlite:///./librarian.db
   LIBRARY_SERVICE_URL=http://localhost:8002
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the service:
   ```bash
   python -m librarian_service
   # or
   uvicorn app.main:app --reload --port 8004
   ```

## Endpoints

- `GET /health` - Health check
- `POST /api/v1/conversations` - Create a new conversation
- `GET /api/v1/conversations` - Get all conversations for the current user
- `GET /api/v1/conversations/{conversation_id}` - Get a specific conversation with messages
- `POST /api/v1/conversations/{conversation_id}/messages` - Send a message in a conversation
- `POST /api/v1/messages` - Send a message (creates conversation if needed)

## Features

- **Conversation Memory**: Each user has persistent conversation history
- **RAG Pipeline**: Every message triggers a search in the library database
- **Context-Aware**: Uses conversation history to provide consistent responses
- **Multi-Strategy Search**: Tries multiple search strategies to find relevant documents

