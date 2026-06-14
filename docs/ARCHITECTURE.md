# Architecture & Operations

This document explains how **API Docs Chatbot** is put together, how a request flows through
the system, how to configure it, and how to troubleshoot a local setup. For a high-level
intro and quick start, see the [main README](../Readme.md).

---

## 1. Components

| Component | Where | Responsibility |
|-----------|-------|----------------|
| **Client** | `client/` | React + TypeScript SPA. Handles Supabase auth, chat UI, persists chats/messages to Supabase, and streams answers from the backend. |
| **FastAPI backend** | `backend-chatbot/` | The main service. Exposes the query/crawl/status/models REST routes, runs the RAG retrieval pipeline, and talks to Ollama. |
| **Retrieval service** | `backend-chatbot/retrieval_service/` | The RAG library: document loading, chunking, dense + sparse embeddings, FAISS vector search, reranking, and relevance scoring. |
| **gRPC server** | `backend/grpc_server/` | *Optional* alternative LLM-serving path used by `/api/v1/chat/grpc/stream`. Not required for the default setup. |
| **Ollama** | external | Serves the local LLM (`llama3.1` by default). |
| **Supabase** | external | Postgres database (users, chats, messages, api_keys) + authentication. |
| **Redis** | external/container | Caches chat history to reduce Supabase reads. |

The client and the backend are decoupled: the client owns auth + chat persistence
(via Supabase), and the backend owns retrieval + LLM inference.

---

## 2. Request lifecycle (streaming answer)

The client uses the **in-process** streaming route (`/api/v1/query/stream`), which talks to
Ollama directly — the gRPC server is not involved.

```
client.streamResponse(message, agent)
   │
   ▼
POST /api/v1/query/stream  { model_name, query, index_name }
   │
   ▼  app/routes/query.py → QAAgent.answer_query_stream()
   │
   ├─ 1. retrieval_service: search the index for `index_name`
   │       embed query → hybrid (dense+sparse) search over FAISS → rerank
   │
   ├─ 2. relevance check (similarity ≥ 0.6 AND term-overlap ≥ 0.25)
   │       └─ if not relevant → stream {"type":"error", ...} and stop
   │
   ├─ 3. build context from the top documents
   │
   ├─ 4. stream {"type":"sources", "content":[...]}   (cited docs)
   │
   └─ 5. LLM (Ollama) generates the answer, streamed as
          {"type":"markdown", "content":"...token..."}  chunks
```

Each streamed line is a JSON object the client parses incrementally:
`sources` (list of cited docs) arrives first, then a series of `markdown` chunks form the
answer body.

---

## 3. RAG retrieval pipeline

> New to RAG or want the *why* behind each step? See the learner-focused
> **[RAG.md](RAG.md)** — it explains embeddings, chunking, hybrid search, and reranking from
> scratch using this project's code. The section below is the condensed reference.

Located in `backend-chatbot/retrieval_service/app/retrieval/`.

1. **Document loading** (`processing/`) — docs for each set are loaded from `data/<set>_docs`
   (e.g. `data/flutter_docs`). Crawling new docs uses `xmltodict` to read sitemaps and
   `BeautifulSoup`/`lxml` to extract content.
2. **Chunking** (`processing/chunker.py`) — text is split into chunks (size bounded by
   `MAX_CHUNK_SIZE`), tokenized with NLTK.
3. **Embeddings** (`embeddings/`) — **dense** vectors via `fastembed`, plus a **sparse**
   representation, indexed in **FAISS**.
4. **Search** (`search.py`) — hybrid retrieval over the FAISS index returns candidate chunks.
5. **Reranking** — a `sentence-transformers` cross-encoder (`Xenova/ms-marco-MiniLM-L-6-v2`)
   reorders candidates by relevance to the query.
6. **Relevance gate** (`scoring/relevance.py`) — the top result must clear both thresholds
   (`relevance_threshold = 0.6`, `term_overlap_threshold = 0.25`); otherwise the query is
   answered with a "no relevant information found" message rather than hallucinating.

Indexes are built/refreshed via the **crawl** route (`POST /api/v1/crawl`) and loaded at
backend startup.

---

## 4. Data model (Supabase / Postgres)

```
users                       chats                          messages
─────                       ─────                          ────────
id           uuid PK        id          uuid PK            id        uuid PK
email        text           user_id     → users.id         chat_id   → chats.id
username     text           agent       agent_type         message   text
created_at                  model       model_type         sender    message_type
updated_at                  name        text               timestamp
is_deleted   bool           created_at / updated_at        is_deleted bool
                            is_deleted   bool

api_keys: id, user_id → users.id, key, created_at, expires_at, is_active
```

**Enums:**
- `agent_type`: `nextjs`, `flutter`, `crust_data`, `reactjs`, `react_native`, `qa_agent`, `crawler_agent`
- `message_type`: `user`, `bot`, `assistant`, `system`
- `model_type`: `llama2`, `llama3`, `llama3.1`

A trigger (`on_auth_user_created` → `handle_new_user()`) copies each new **Supabase Auth**
user (`auth.users`) into `public.users` on signup. `chats.user_id` references
`public.users(id)` (`ON DELETE CASCADE`).

---

## 5. Configuration

### Backend (`backend-chatbot/.env` or compose `environment:`)

Required/most relevant settings (see `app/core/config.py` for the full list):

| Var | Example | Notes |
|-----|---------|-------|
| `HOST` / `PORT` | `0.0.0.0` / `8000` | bind address |
| `CORS_ORIGINS` | `["http://localhost:3000"]` | JSON array |
| `DEFAULT_MODEL_NAME` | `llama3.1` | must be in `ENABLED_MODELS` |
| `ENABLED_MODELS` | `["llama3.1","llama2","llama3"]` | JSON array of allowed models |
| `MAX_CHUNK_SIZE` | `2000` | **required** — chunk size for indexing |
| `DATA_DIR` | `/app/data` | where doc indexes live |
| `OLLAMA_HOST` | `http://host.docker.internal:11434` | how the backend reaches Ollama (see gotchas) |
| `REDIS_HOST` / `REDIS_PORT` | `redis` / `6379` | chat-history cache |
| `SUPABASE_URL` / `SUPABASE_KEY` / `SUPABASE_JWT_SECRET` | — | DB + auth (see gotchas) |
| `GRPC_SERVER_ADDRESS` | `grpc-server:50051` | only for the gRPC path |

### Frontend (`client/.env`)

| Var | Notes |
|-----|-------|
| `REACT_APP_BACKEND_URL` | e.g. `http://localhost:8000` |
| `REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_KEY` | Supabase project URL + anon/publishable key |
| `REACT_APP_MODEL_NAME` | default model the client requests (e.g. `llama3.1`) |
| `REACT_APP_GOOGLE_AUTH_CLIENT_ID` | Google sign-in (via Supabase) |

---

## 6. Local development & troubleshooting

These are the real gotchas hit while bringing the stack up locally (Docker Desktop, Apple
Silicon / arm64). They're also encoded in `docker-compose.yml`, the Dockerfile, and
`requirements.txt`.

| Symptom | Cause | Fix |
|---------|-------|-----|
| Backend container "Up" but `curl :8000` fails (HTTP 000) | App crashed at import | Check `docker logs docs-chatbot-backend` for the real error |
| `pydantic ... MAX_CHUNK_SIZE Field required` | Stale container missing an env var | Recreate the container so it picks up current compose env |
| `ModuleNotFoundError` (`xmltodict`, `nltk`, `fastembed`, `psutil`, `jwt`, `supabase`) | `requirements.txt` was incomplete vs. code imports | All added to `requirements.txt`; rebuild the image |
| `Illegal instruction` (SIGILL) on startup | `cryptography` 49.x's Rust extension uses CPU instructions unsupported by the Docker arm64 VM | Pin `cryptography==44.0.1` (done in `requirements.txt`) |
| LLM call fails / connection refused | LangChain `Ollama` defaults to `localhost:11434` = the container itself | Pass `base_url=$OLLAMA_HOST` (done in `app/utils/llm_utils.py`) |
| `Requested model X not available, using llama2` then ollama error | Model not in `ENABLED_MODELS`, or model name tag mismatch | Add the model to `ENABLED_MODELS`; ensure the name matches a pulled Ollama tag |
| Every request returns 401 | Backend verifies Supabase JWTs; project may use ES256 (asymmetric) keys the HS256 path can't verify | For local/learning, auth is bypassed in `app/middleware/authMiddleware.py`. **Do not ship that.** For production, verify ES256 against the project JWKS. |
| Browser shows "Failed to fetch streaming response from backend" but `curl` works | CORS — the chat UI runs on `http://chat.localhost:3000` (per `REACT_APP_SUBDOMAIN`), which wasn't in the backend's allowed origins. `curl` is server-side so CORS never applies. | Add the UI origin to `CORS_ORIGINS` in `docker-compose.yml` (e.g. `http://chat.localhost:3000`) and recreate the backend. |
| Browser fails for ~40s after `docker compose up`, then works | Backend not ready yet — it loads torch, embeddings, and doc indexes on startup | Wait until `http://localhost:8000/docs` returns 200 before using the UI |
| "No relevant information found" | Retrieval relevance gate rejected the results | Rephrase the query, or tune thresholds in `retrieval_service/.../scoring/relevance.py` |

> ⚠️ **Security note:** auth verification is intentionally disabled for local/learning use.
> Re-enable proper token verification before deploying anywhere public.

### Useful commands

```bash
# Rebuild backend image after changing requirements/Dockerfile
docker compose build backend && docker compose up -d --force-recreate backend

# Tail backend logs
docker logs -f docs-chatbot-backend

# Confirm the backend can reach Ollama
docker exec docs-chatbot-backend python -c \
  "import urllib.request; print(urllib.request.urlopen('http://host.docker.internal:11434/api/tags').read()[:200])"

# List pulled Ollama models
ollama list
```
