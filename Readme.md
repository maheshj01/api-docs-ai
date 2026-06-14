# API Docs Chatbot

A conversational AI assistant that answers questions about API/framework documentation
(Flutter, Next.js, Crustdata, …) using **Retrieval-Augmented Generation (RAG)**. Ask a
question in natural language and get a streamed, source-cited answer grounded in the
official docs instead of scrolling through pages of reference material.

> For a deeper technical walkthrough (request lifecycle, RAG pipeline, data model,
> configuration, troubleshooting) see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.
>
> New to RAG? Start with **[docs/RAG.md](docs/RAG.md)** — a learner's guide to how retrieval-
> augmented generation works, explained against this project's actual code.

---

## How it works (in one picture)

```
                ┌─────────────┐   stream {sources, markdown}   ┌──────────────────────┐
   You  ───────▶│   Client    │◀───────────────────────────────│   FastAPI backend    │
   (chat)       │  (React)    │   POST /api/v1/query/stream     │  (backend-chatbot)   │
                └──────┬──────┘                                 └──────────┬───────────┘
                       │ auth + chat history                               │
                       ▼                                                   ▼
                ┌─────────────┐                          ┌────────────────────────────────┐
                │  Supabase   │                          │  RAG retrieval pipeline          │
                │ (Postgres + │                          │  embed → FAISS search → rerank   │
                │   Auth)     │                          │  → relevance check → build ctx   │
                └─────────────┘                          └───────────────┬──────────────────┘
                       ▲                                                  │ context + prompt
                       │ chat history cache                              ▼
                ┌─────────────┐                          ┌────────────────────────────────┐
                │    Redis    │                          │   Ollama (local LLM, llama3.1)   │
                └─────────────┘                          └────────────────────────────────┘
```

1. The user signs in (Supabase Auth) and starts a chat scoped to one doc set ("agent"),
   e.g. `flutter` or `nextjs`. Chats and messages are stored in Supabase.
2. On each message the client `POST`s `{ model_name, query, index_name }` to the backend's
   streaming endpoint.
3. The backend runs a **hybrid retrieval pipeline** over the pre-built document index for
   that doc set, checks relevance, and assembles a context.
4. The context + question are sent to a local **Ollama** LLM, whose answer is **streamed**
   back to the client as JSON chunks (`sources` first, then `markdown` tokens).

---

## Tech stack

| Layer        | Technology |
|--------------|------------|
| Frontend     | React 18, TypeScript, Tailwind CSS, Redux Toolkit, Supabase JS |
| Backend API  | Python, FastAPI, LangChain |
| LLM          | Ollama (local) — `llama3.1`, `llama3`, `llama2` |
| Retrieval    | FAISS (vector index), `fastembed` (dense) + sparse embeddings, `sentence-transformers` reranker, NLTK |
| Auth & DB    | Supabase (Postgres + Auth) |
| Cache        | Redis (chat-history caching) |
| Optional     | gRPC server (alternative LLM-serving path, not required) |
| Infra        | Docker Compose |

---

## Quick start (one command)

**Prerequisites:** Docker Desktop, [Ollama](https://ollama.com) with a model pulled, a Supabase
project, and Node.js (for the client). First time only: `ollama pull llama3.1` and
`cd client && npm install`.

```bash
make start   # backend + redis (Docker) and the client (npm) — all in the background
make stop    # stop everything
```

That's it. `make start` brings up the FastAPI backend + Redis via Docker and launches the
React client; `make stop` tears it all down. Other targets:

| Command | What it does |
|---------|--------------|
| `make start` | Start backend + redis (Docker) and the client (npm) |
| `make stop` | Stop the client and the Docker services |
| `make restart` | `stop` then `start` |
| `make status` | Show what's running + backend health |
| `make logs` | Tail the backend logs |

- Backend Swagger UI: <http://localhost:8000/docs> (ready ~30s after start)
- Client: <http://localhost:3000> (compiling — `tail -f client.log` to watch)
- **Ollama** runs as its own container (`docs-chatbot-ollama`) and is treated as an always-on
  dependency — `make` does not start/stop it.

### Manual equivalent

If you'd rather run the pieces yourself:

```bash
docker compose up -d backend redis        # backend + redis
cd client && npm start                     # client on http://localhost:3000
# stop:  docker compose down  (+ Ctrl-C the client)
```

See the client [README](client/README.md) for client-specific details.

---

## Quick start (manual / no Docker)

Each backend uses its own virtualenv. Create a `.env` from `backend-chatbot/.env.example` first.

```bash
# FastAPI backend
cd backend-chatbot
python -m venv fast-env && source fast-env/bin/activate
pip install -r requirements.txt
python main.py
# or, multi-worker: uvicorn app.api_router:app --host 0.0.0.0 --port 8000 --reload
```

Optional gRPC backend (only if you use the gRPC streaming path):

```bash
cd backend/grpc_server
python -m venv grpc-env && source grpc-env/bin/activate
pip install -r requirements.txt
python server.py
```

Ensure **Ollama** is running with the required model(s) pulled (`llama3.1`, `llama3`, or
`llama2`).

---

## Project structure

```
api-docs-ai/
├── client/                 # React + TypeScript frontend (Supabase auth, chat UI)
├── backend-chatbot/        # FastAPI backend — the main service
│   ├── app/
│   │   ├── api_router.py    # app entrypoint; mounts routers, startup hooks
│   │   ├── routes/          # query (RAG stream), crawl, status, models, grpc_routes
│   │   ├── agents/          # QAAgent (answer), CrawlerAgent (build index)
│   │   ├── core/            # config (Settings), model registry, logger
│   │   ├── middleware/      # auth (Supabase JWT)
│   │   └── utils/           # llm_utils (Ollama), retrieval manager
│   └── retrieval_service/   # RAG pipeline (chunking, embeddings, FAISS, rerank, scoring)
├── backend/grpc_server/    # Optional gRPC LLM-serving server
├── research/               # Experiments / notebooks
├── docs/ARCHITECTURE.md    # Detailed architecture & ops docs
└── docs/RAG.md             # Learner's guide to how the RAG pipeline works
```

---

## Key API endpoints (FastAPI backend)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/query/stream` | Streaming RAG answer (in-process Ollama) — used by the client |
| POST | `/api/v1/query` | Non-streaming RAG answer |
| POST | `/api/v1/chat/grpc/stream` | Streaming answer via the gRPC server (alternative) |
| POST | `/api/v1/crawl` | (Re)build the document index for a doc set |
| GET  | `/api/v1/status` | Service/health status |
| GET  | `/api/v1/models` | Available LLM models |
| GET  | `/docs` | Swagger UI |

---

## Supported documentation sets

| Doc set (`index_name`) | Source |
|------------------------|--------|
| `flutter`   | <https://docs.flutter.dev/> (sitemap: `/sitemap.xml`) |
| `nextjs`    | <https://nextjs.org/docs> (sitemap: `/sitemap.xml`) |
| `crust_data`| [Crustdata API docs](https://crustdata.notion.site/Crustdata-Discovery-And-Enrichment-API-c66d5236e8ea40df8af114f6d447ab48) |

New doc sets are added by crawling a sitemap and building a new index.

---

## Why this project

API docs are long and dense, and they change often. This chatbot offers a **conversational
interface** that returns concise, **source-cited** answers grounded in the latest official
documentation — saving developers the time of searching through reference pages. It is built
as a learning project exploring RAG, local LLMs, and full-stack AI app architecture.

## Roadmap

- User-provided data sources (URL, PDF, text file, custom vector DB)
- More doc sets (React, React Native, etc.)
- Scheduled monthly re-crawl to keep indexes fresh
