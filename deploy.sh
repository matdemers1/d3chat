#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

cd "$(dirname "$0")"

# Check .env.prod exists
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.prod.example and fill in your secrets:"
  echo "  cp .env.prod.example .env.prod"
  exit 1
fi

# Pull latest code
echo "==> Pulling latest code..."
git pull

# Build and start containers
echo "==> Building and starting containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

# Wait for health check
echo "==> Waiting for backend health check..."
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T backend curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    echo "==> Backend is healthy!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "WARNING: Health check timed out after 30s. Check logs with:"
    echo "  docker compose -f $COMPOSE_FILE logs backend"
  fi
  sleep 1
done

# Show status
echo ""
echo "==> Container status:"
docker compose -f "$COMPOSE_FILE" ps
