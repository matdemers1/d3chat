#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDS=()

cleanup() {
  echo ""
  echo "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  docker compose -f "$ROOT/docker-compose.infra.yml" down
  exit 0
}
trap cleanup INT TERM

# 1. Start postgres + redis
echo "==> Starting postgres & redis..."
docker compose -f "$ROOT/docker-compose.infra.yml" up -d --wait

# 2. Set up backend venv if needed
VENV="$ROOT/backend/.venv"
if [ ! -d "$VENV" ]; then
  echo "==> Creating backend venv..."
  python3 -m venv "$VENV"
fi
# Always ensure deps are installed (fast no-op if already up to date)
"$VENV/bin/pip" install -q -e "$ROOT/backend"

# 3. Run alembic migrations
echo "==> Running migrations..."
cd "$ROOT/backend"
"$VENV/bin/alembic" upgrade head

# 4. Start backend (uvicorn with reload)
echo "==> Starting backend on :8000..."
"$VENV/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000 --reload &
PIDS+=($!)

# 5. Start frontend (vite dev server)
echo "==> Starting frontend on :3000..."
cd "$ROOT/frontend"
npm run dev &
PIDS+=($!)

echo ""
echo "==> All services running:"
echo "    Frontend : http://localhost:3000"
echo "    Backend  : http://localhost:8000"
echo "    Postgres : localhost:5432"
echo "    Redis    : localhost:6379"
echo ""
echo "Press Ctrl+C to stop everything."

wait
