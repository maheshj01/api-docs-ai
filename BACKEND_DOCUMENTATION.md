# Backend Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Services](#services)
4. [Getting Started](#getting-started)
5. [API Endpoints](#api-endpoints)
6. [gRPC Services](#grpc-services)
7. [Database & Caching](#database--caching)
8. [Configuration](#configuration)
9. [Development Guide](#development-guide)
10. [Deployment](#deployment)

---

## Overview

The backend is a dual-service system designed to power an AI-driven documentation chatbot with the following capabilities:

- **Document Indexing**: Crawl and index documentation from sitemaps
- **Question-Answering**: Process user queries using LLM models and retrieval-augmented generation (RAG)
- **Multi-Model Support**: Supports multiple LLM models (Llama 2, Llama 3, Llama 3.1)
- **Real-time Streaming**: Stream responses using both REST and gRPC
- **Caching**: Redis-based caching for improved performance
- **Data Persistence**: Supabase for storing chat history and user interactions

### Key Statistics

- **Technology Stack**: FastAPI, gRPC, LangChain, FAISS, Ollama
- **Python Version**: 3.11+
- **Services**: 2 main services (FastAPI Chatbot + gRPC Server)
- **Supported Models**: Llama 2, Llama 3, Llama 3.1

---

## Architecture

### System Overview

```
┌─────────────────┐
│     Client      │
└────────┬────────┘
         │
    ┌────┴────┐
    │          │
    ▼          ▼
┌─────────┐  ┌──────────┐
│ FastAPI │  │   gRPC   │
│  REST   │  │  Server  │
└────┬────┘  └────┬─────┘
     │            │
     └─────┬──────┘
           │
      ┌────┴────────────────┐
      │                     │
      ▼                     ▼
  ┌────────┐         ┌─────────────┐
  │ Redis  │         │  Supabase   │
  │ Cache  │         │  Database   │
  └────────┘         └─────────────┘
      │
      └─── Ollama (LLM Models)
```

### Directory Structure

```
backend/
├── grpc_server/              # gRPC service implementation
│   ├── agents/              # QA agent logic
│   ├── core/                # Configuration, logging, models
│   ├── data/                # Documentation data
│   ├── retrieval_service/   # Vector search and retrieval
│   ├── utils/               # Helper utilities
│   ├── server.py            # gRPC server entry point
│   └── chat_service.proto   # Protocol Buffer definitions
│
backend-chatbot/
├── app/
│   ├── agents/              # Crawler and QA agents
│   ├── api_router.py        # FastAPI app configuration
│   ├── core/                # Configuration and setup
│   ├── models/              # Data models
│   ├── routes/              # API endpoints
│   ├── services/            # Redis and Supabase clients
│   ├── middleware/          # CORS, auth middleware
│   └── grpc/                # gRPC client integration
├── data/                     # Documentation and prompts
├── retrieval_service/        # Vector retrieval service
├── main.py                   # FastAPI entry point
└── requirements.txt          # Python dependencies
```

---

## Services

### 1. FastAPI Backend (`backend-chatbot/`)

A modern REST API for the documentation chatbot with streaming capabilities.

**Port**: 8000  
**Entry Point**: `main.py`

#### Features
- REST endpoints for document crawling and querying
- WebSocket support for streaming responses
- Redis caching for chat history
- Supabase integration for persistent storage
- CORS middleware for cross-origin requests

#### Key Components

**API Router** (`app/api_router.py`)
- Initializes FastAPI application
- Sets up middleware (CORS)
- Manages service connections (Redis, Supabase)
- Lifecycle events (startup/shutdown)

**Routes**
- `/api/v1/crawl`: Index documentation from sitemaps
- `/api/v1/query`: Query indexed documentation
- `/api/v1/status`: Service health check
- `/api/v1/models`: Get available models
- `/api/v1/chat/stream`: WebSocket streaming endpoint

### 2. gRPC Server (`backend/grpc_server/`)

High-performance gRPC service for chat operations with streaming responses.

**Port**: 50051  
**Entry Point**: `server.py`

#### Features
- Streaming chat responses
- Model availability checking
- Dynamic document source initialization
- Support for chat history context

#### Key Services

**ChatService** (`server.py`)
- `StreamChat`: Stream responses to user queries
- `InitializeDocSource`: Initialize documentation sources
- `ProcessDocumentation`: Process and index documents
- `GetAvailableModels`: List available LLM models
- `GetAvailableSources`: List initialized documentation sources

---

## Getting Started

### Prerequisites

- Python 3.11+
- Ollama (for running LLM models locally)
- Redis 7+
- PostgreSQL/Supabase account

### Installation

#### 1. Clone and Setup

```bash
cd /Users/mahesh/Development/api-docs-ai-1
python -m venv venv
source venv/bin/activate
```

#### 2. Install Dependencies

```bash
# For FastAPI backend
cd backend-chatbot
pip install -r requirements.txt

# For gRPC server
cd ../backend/grpc_server
pip install -r requirements.txt
```

#### 3. Environment Configuration

Create `.env` file in `backend-chatbot/`:

```env
# FastAPI Settings
HOST=127.0.0.1
PORT=8000
DEBUG=true
PROJECT_NAME=API Docs Chatbot

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=None
REDIS_DB=0

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
SUPABASE_JWT_SECRET=your_jwt_secret

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:8000

# Model Configuration
DEFAULT_MODEL=llama3
```

#### 4. Start Required Services

```bash
# Terminal 1: Start Redis
docker run -d --name redis-server -p 6379:6379 redis:7

# Terminal 2: Start Ollama
ollama serve

# Terminal 3: Pull a model (if not already present)
ollama pull llama3
```

#### 5. Run FastAPI Backend

```bash
cd backend-chatbot
python main.py
# or with auto-reload
uvicorn app.api_router:app --host 127.0.0.1 --port 8000 --reload
```

#### 6. Run gRPC Server (Optional)

```bash
cd backend/grpc_server
python server.py
```

---

## API Endpoints

### FastAPI REST Endpoints

#### 1. Document Crawling

**Endpoint**: `POST /api/v1/crawl`

Initialize and index documentation from a sitemap.

**Request**:
```json
{
  "sitemap_url": "https://nextjs.org/sitemap.xml",
  "index_name": "nextjs"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Documentation indexed successfully",
  "documents_indexed": 234,
  "index_name": "nextjs"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8000/api/v1/crawl" \
     -H "Content-Type: application/json" \
     -d '{
       "sitemap_url": "https://nextjs.org/sitemap.xml",
       "index_name": "nextjs"
     }'
```

#### 2. Query Documentation

**Endpoint**: `POST /api/v1/query`

Query indexed documentation and get AI-powered responses.

**Request**:
```json
{
  "query": "How do I create a new Next.js project?",
  "index_name": "nextjs",
  "model": "llama3",
  "temperature": 0.7
}
```

**Response**:
```json
{
  "answer": "To create a new Next.js project...",
  "sources": [
    {
      "title": "Getting Started",
      "url": "https://nextjs.org/docs/getting-started",
      "relevance_score": 0.95
    }
  ],
  "model_used": "llama3",
  "processing_time_ms": 1234
}
```

**Example**:
```bash
curl -X POST "http://localhost:8000/api/v1/query" \
     -H "Content-Type: application/json" \
     -d '{
       "query": "How do I create a new Next.js project?",
       "index_name": "nextjs",
       "model": "llama3"
     }'
```

#### 3. Get Available Models

**Endpoint**: `GET /api/v1/models`

Retrieve list of available LLM models.

**Response**:
```json
{
  "models": [
    {
      "name": "llama2",
      "status": "available",
      "parameters": "7B"
    },
    {
      "name": "llama3",
      "status": "available",
      "parameters": "8B"
    },
    {
      "name": "llama3.1",
      "status": "available",
      "parameters": "8B"
    }
  ]
}
```

#### 4. Service Status

**Endpoint**: `GET /api/v1/status`

Check service health and connectivity.

**Response**:
```json
{
  "status": "healthy",
  "redis": "connected",
  "supabase": "connected",
  "ollama": "ready",
  "timestamp": "2025-03-15T10:30:00Z"
}
```

#### 5. Stream Chat

**Endpoint**: `WebSocket /api/v1/chat/stream`

Establish WebSocket connection for streaming chat responses.

**Message Format**:
```json
{
  "query": "How do I handle errors?",
  "index_name": "nextjs",
  "model": "llama3",
  "chat_history": [
    {
      "role": "user",
      "content": "What is Next.js?"
    },
    {
      "role": "assistant",
      "content": "Next.js is a React framework..."
    }
  ]
}
```

---

## gRPC Services

### Protocol Buffer Definition

**File**: `backend/proto/chat_service.proto`

```protobuf
service ChatService {
    rpc StreamChat (ChatRequest) returns (stream ChatResponse) {}
    rpc InitializeDocSource (InitSourceRequest) returns (InitSourceResponse) {}
    rpc ProcessDocumentation (ProcessDocRequest) returns (ProcessDocResponse) {}
    rpc GetAvailableModels (EmptyRequest) returns (ModelsResponse) {}
    rpc GetAvailableSources (EmptyRequest) returns (SourcesResponse) {}
}
```

### Available RPCs

#### 1. StreamChat

Stream responses for a given query with chat history context.

**Request**:
```protobuf
message ChatRequest {
    string model_name = 1;           // "llama3"
    string query = 2;                // User query
    string index_name = 3;           // Documentation source
    repeated Message chat_history = 4;
}

message Message {
    string role = 1;     // "user" or "assistant"
    string content = 2;  // Message text
}
```

**Response** (streamed):
```protobuf
message ChatResponse {
    string type = 1;     // "markdown", "sources", "model_info", "error", "end"
    string content = 2;  // Response content
}
```

#### 2. InitializeDocSource

Initialize a documentation source for use.

**Request**:
```protobuf
message InitSourceRequest {
    string source_name = 1;  // "nextjs", "react", etc.
}
```

#### 3. GetAvailableModels

Get list of available models.

**Response**:
```protobuf
message ModelsResponse {
    repeated string model_names = 1;
    bool success = 2;
    string message = 3;
}
```

#### 4. GetAvailableSources

Get list of initialized documentation sources.

**Response**:
```protobuf
message SourcesResponse {
    repeated string source_names = 1;
    bool success = 2;
    string message = 3;
}
```

---

## Database & Caching

### Redis Caching

**Purpose**: High-speed caching layer for frequently accessed data

**Cache Structure**:
```
chat_history:{chat_id}      -> Cached conversation messages
model_info:{model_name}     -> Model metadata and configuration
source_cache:{source_name}  -> Indexed documentation metadata
```

**Workflow**:
1. API receives request
2. Check Redis cache for `chat_history:{chat_id}`
3. If cache hit → return immediately
4. If cache miss → query Supabase
5. Store result in Redis with TTL
6. Return to client

### Supabase Data Storage

**Tables**:

#### users
```sql
CREATE TABLE public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    username text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_deleted boolean DEFAULT false
);
```

#### chats
```sql
CREATE TABLE public.chats (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id),
    agent agent_type NOT NULL,
    model model_type NOT NULL,
    name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp without time zone,
    is_deleted boolean DEFAULT false
);
```

#### messages
```sql
CREATE TABLE public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id uuid NOT NULL REFERENCES public.chats(id),
    message text NOT NULL,
    sender message_type NOT NULL,
    timestamp timestamp with time zone DEFAULT now(),
    is_deleted boolean DEFAULT false
);
```

#### api_keys
```sql
CREATE TABLE public.api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id),
    key text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone,
    is_active boolean DEFAULT true
);
```

**ENUM Types**:
```sql
CREATE TYPE public.agent_type AS ENUM (
    'nextjs', 'flutter', 'crust_data', 'reactjs', 'react_native', 'qa_agent', 'crawler_agent'
);

CREATE TYPE public.message_type AS ENUM (
    'user', 'bot', 'assistant', 'system'
);

CREATE TYPE public.model_type AS ENUM (
    'llama2', 'llama3', 'llama3.1'
);
```

---

## Configuration

### Environment Variables

#### Core Settings
```env
HOST=127.0.0.1              # API host
PORT=8000                   # API port
DEBUG=true                  # Debug mode
PROJECT_NAME=API Docs Chatbot
```

#### Ollama (LLM Provider)
```env
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_MODEL=llama3
```

#### Redis
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=None         # Set to None for no auth
REDIS_DB=0
REDIS_TTL=3600             # Cache TTL in seconds
```

#### Supabase
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_JWT_SECRET=your-jwt-secret
```

#### CORS
```env
CORS_ORIGINS=http://localhost:3000,http://localhost:8000
```

### Configuration Class

**File**: `backend-chatbot/app/core/config.py`

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # API Settings
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    DEBUG: bool = True
    PROJECT_NAME: str = "API Docs Chatbot"
    
    # Ollama
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    DEFAULT_MODEL: str = "llama3"
    
    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: Optional[str] = None
    REDIS_DB: int = 0
    
    # Supabase
    SUPABASE_URL: str
    SUPABASE_KEY: str
    
    # CORS
    CORS_ORIGINS: str = "http://localhost:3000"
    
    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    class Config:
        env_file = ".env"
```

---

## Development Guide

### Adding Support for New Documentation

#### Step 1: Add Initial Prompt

Edit `backend-chatbot/data/initial_prompts.json`:

```json
{
  "documentation_sources": {
    "vue": {
      "name": "Vue.js",
      "sitemap_url": "https://vuejs.org/sitemap.xml",
      "system_prompt": "You are a helpful Vue.js expert assistant..."
    }
  }
}
```

#### Step 2: Crawl and Index

```bash
curl -X POST "http://localhost:8000/api/v1/crawl" \
     -H "Content-Type: application/json" \
     -d '{
       "sitemap_url": "https://vuejs.org/sitemap.xml",
       "index_name": "vue"
     }'
```

#### Step 3: Query the Source

```bash
curl -X POST "http://localhost:8000/api/v1/query" \
     -H "Content-Type: application/json" \
     -d '{
       "query": "How do I create a component in Vue?",
       "index_name": "vue"
     }'
```

### Key Components

#### QA Agent (`app/agents/qa_agent.py`)

Handles question-answering using LangChain and RAG.

```python
class QAAgent:
    def __init__(self, llm, index_name):
        self.llm = llm
        self.index_name = index_name
        self.retriever = self.init_retriever()
    
    async def answer_query(self, query, chat_history):
        # Retrieve relevant documents
        documents = self.retriever.retrieve(query)
        
        # Build context
        context = self._build_context(documents)
        
        # Generate response with LLM
        response = await self.llm.generate(query, context, chat_history)
        return response
```

#### Crawler Agent (`app/agents/crawler_agent.py`)

Handles document crawling and indexing.

```python
class CrawlerAgent:
    async def crawl_sitemap(self, sitemap_url):
        # Parse sitemap XML
        urls = parse_sitemap(sitemap_url)
        
        # Fetch and process documents
        documents = []
        for url in urls:
            content = fetch_url(url)
            doc = process_document(content)
            documents.append(doc)
        
        # Index documents
        await self.index_documents(documents)
```

#### LLM Utils (`app/utils/llm_utils.py`)

Manages LLM initialization and configuration.

```python
def get_llm(model_config):
    """
    Create and return LLM instance based on configuration.
    Supports Ollama for local inference.
    """
    return Ollama(
        model=model_config.name,
        base_url=model_config.base_url,
        temperature=model_config.temperature
    )
```

#### Retrieval Manager (`app/utils/retrieval_manager.py`)

Handles vector search and document retrieval.

```python
class PipelineManager:
    async def initialize_pipeline(self, source_name):
        """Initialize retrieval pipeline for a documentation source"""
        # Load documents
        documents = load_documents(source_name)
        
        # Generate embeddings
        embeddings = generate_embeddings(documents)
        
        # Create vector store (FAISS)
        self.vector_store = FAISS.from_documents(documents, embeddings)
    
    def retrieve(self, query, top_k=5):
        """Retrieve relevant documents for a query"""
        return self.vector_store.similarity_search(query, k=top_k)
```

### Testing

#### Unit Tests

```bash
# Run all tests
pytest backend-chatbot/

# Run specific test
pytest backend-chatbot/tests/test_qa_agent.py

# With coverage
pytest --cov=app backend-chatbot/
```

#### Integration Tests

```bash
# Test with actual services
pytest -m integration backend-chatbot/
```

#### Manual Testing

```bash
# Test gRPC connectivity
cd backend/grpc_server
python -m grpc_tools.protoc -I../proto --python_out=. --grpc_python_out=. ../proto/chat_service.proto

# Create a test client
python tests/grpc_client_test.py
```

---

## Deployment

### Docker Deployment

#### Build Docker Image

```bash
# Build backend image
docker build -t api-docs-backend:latest -f backend-chatbot/Dockerfile .

# Build gRPC image
docker build -t api-docs-grpc:latest -f backend/grpc_server/Dockerfile .
```

#### Docker Compose

**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  redis:
    image: redis:7
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  backend:
    build:
      context: .
      dockerfile: backend-chatbot/Dockerfile
    ports:
      - "8000:8000"
    environment:
      - REDIS_HOST=redis
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
    depends_on:
      - redis
    networks:
      - api-network

  grpc_server:
    build:
      context: .
      dockerfile: backend/grpc_server/Dockerfile
    ports:
      - "50051:50051"
    environment:
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
    networks:
      - api-network

volumes:
  redis_data:

networks:
  api-network:
```

#### Run with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

### Production Deployment

#### Gunicorn Configuration

```bash
# Install gunicorn
pip install gunicorn

# Run with gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 app.api_router:app
```

#### Nginx Reverse Proxy

```nginx
upstream api_backend {
    server localhost:8000;
}

server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### Environment Variables for Production

```env
HOST=0.0.0.0
PORT=8000
DEBUG=false

OLLAMA_BASE_URL=http://ollama-service:11434
REDIS_HOST=redis-service
REDIS_PASSWORD=secure_password_here

SUPABASE_URL=https://your-production-project.supabase.co
SUPABASE_KEY=production-key

CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

#### Health Checks

```bash
# Check API health
curl http://localhost:8000/api/v1/status

# Expected response:
# {
#   "status": "healthy",
#   "redis": "connected",
#   "supabase": "connected",
#   "ollama": "ready"
# }
```

---

## Troubleshooting

### Common Issues

#### 1. Redis Connection Failed

**Error**: `ConnectionError: Error 111 connecting to 127.0.0.1:6379`

**Solution**:
```bash
# Check if Redis is running
redis-cli ping

# If not running, start Redis
docker run -d --name redis-server -p 6379:6379 redis:7
```

#### 2. Ollama Not Available

**Error**: `HTTPConnectionPool: Max retries exceeded`

**Solution**:
```bash
# Check Ollama service
curl http://localhost:11434/api/tags

# Start Ollama if needed
ollama serve
```

#### 3. Model Not Found

**Error**: `ValueError: Model llama3 not available`

**Solution**:
```bash
# Pull the model
ollama pull llama3

# Verify model is installed
ollama list
```

#### 4. Supabase Connection Failed

**Error**: `psycopg2.OperationalError: could not connect to server`

**Solution**:
- Verify Supabase credentials in `.env`
- Check internet connectivity
- Ensure database is not paused in Supabase dashboard

#### 5. CORS Issues

**Error**: `Access to XMLHttpRequest has been blocked by CORS policy`

**Solution**:
```env
# Update CORS_ORIGINS in .env
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
```

---

## Performance Optimization

### Caching Strategy

1. **Query Results**: Cache frequently asked questions for 1 hour
2. **Document Embeddings**: Pre-compute and cache embeddings
3. **Chat History**: Keep last 50 messages in Redis

### Batch Processing

```python
# Process multiple documents in parallel
async def batch_index_documents(documents):
    tasks = [index_document(doc) for doc in documents]
    await asyncio.gather(*tasks)
```

### Connection Pooling

```python
# Redis connection pool
redis_pool = ConnectionPool(
    host='localhost',
    port=6379,
    max_connections=10
)
redis = Redis(connection_pool=redis_pool)
```

---

## Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [gRPC Python Guide](https://grpc.io/docs/languages/python/)
- [LangChain Documentation](https://python.langchain.com/)
- [Supabase Documentation](https://supabase.com/docs)
- [Ollama Documentation](https://github.com/ollama/ollama)
- [Redis Documentation](https://redis.io/documentation)

---

## Support

For issues or questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review the [GitHub Wiki](https://github.com/maheshj01/api-docs-ai/wiki/Backend-Architecture)
3. Open an issue on GitHub

---

**Last Updated**: June 2025  
**Version**: 1.0.0
