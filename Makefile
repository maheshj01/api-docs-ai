# API Docs Chatbot — local dev orchestration
#
#   make start   → start backend + redis (Docker) and the client (npm), in the background
#   make stop    → stop the client and the Docker services
#   make restart → stop then start
#   make status  → show what's running
#   make logs    → tail the backend logs
#
# Ollama runs as its own container (docs-chatbot-ollama) and is treated as an
# always-on dependency — it is intentionally NOT started/stopped here.

CLIENT_DIR := client
CLIENT_PORT := 3000
CLIENT_PID := .client.pid
CLIENT_LOG := client.log

# Doc sources to (re)build with `make crawl`. Must match DocSource in
# retrieval_service/app/core/enums.py.
SOURCES := flutter nextjs vue fastapi
BACKEND_URL := http://localhost:8000

.PHONY: start stop restart status logs crawl

start:
	@echo "▶  Starting backend + redis (Docker)…"
	docker compose up -d backend redis
	@echo "▶  Starting client (npm) → logs in $(CLIENT_LOG)…"
	@cd $(CLIENT_DIR) && BROWSER=none npm start > ../$(CLIENT_LOG) 2>&1 & echo $$! > $(CLIENT_PID)
	@echo ""
	@echo "✅ Started."
	@echo "   Backend : http://localhost:8000/docs   (ready in ~30s)"
	@echo "   Client  : http://localhost:$(CLIENT_PORT)            (compiling — watch with: tail -f $(CLIENT_LOG))"

stop:
	@echo "⏹  Stopping client…"
	@-if [ -f $(CLIENT_PID) ]; then kill `cat $(CLIENT_PID)` 2>/dev/null; rm -f $(CLIENT_PID); fi
	@-lsof -ti tcp:$(CLIENT_PORT) | xargs kill 2>/dev/null || true
	@echo "⏹  Stopping Docker services…"
	docker compose down
	@echo "✅ Stopped."

restart: stop start

status:
	@echo "=== Docker ==="
	@docker compose ps
	@echo "=== Client (port $(CLIENT_PORT)) ==="
	@lsof -ti tcp:$(CLIENT_PORT) >/dev/null 2>&1 && echo "running (pid `lsof -ti tcp:$(CLIENT_PORT)`)" || echo "not running"
	@echo "=== Backend health ==="
	@curl -s -o /dev/null -w "  http://localhost:8000/docs -> %{http_code}\n" http://localhost:8000/docs || true

logs:
	docker logs -f docs-chatbot-backend

# Re-crawl every doc source for fresh data. Slow + synchronous: each source
# fetches its whole sitemap then re-embeds (minutes per source). Watch progress
# with `make logs` in another terminal. The backend must be running.
crawl:
	@for s in $(SOURCES); do \
		echo "=== crawling $$s ==="; \
		curl -s -X POST $(BACKEND_URL)/api/v1/crawl \
			-H "Content-Type: application/json" \
			-d "{\"index_name\":\"$$s\"}" --max-time 1800; \
		echo; \
	done
	@echo "✅ Crawl complete for: $(SOURCES)"
