# d3chat Deployment Guide

## Docker (Recommended)

### Quick Start

```bash
git clone https://github.com/your-org/d3chat.git
cd d3chat
cp .env.example .env
# Edit .env with your settings:
#   SECRET_KEY=<random-secret>
#   SERVER_DOMAIN=chat.yourdomain.com
docker compose up -d
```

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://d3chat:d3chat@postgres:5432/d3chat` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379/0` |
| `SECRET_KEY` | JWT signing secret | (required) |
| `SERVER_DOMAIN` | This server's public domain | `localhost:8000` |
| `CORS_ORIGINS` | Allowed CORS origins (JSON array) | `["http://localhost:3000"]` |
| `VITE_API_URL` | Frontend API base URL | `http://localhost:8000/api/v1` |
| `VITE_WS_URL` | Frontend WebSocket URL | `ws://localhost:8000/ws` |

### Production Checklist

1. Set a strong `SECRET_KEY`
2. Set `SERVER_DOMAIN` to your public domain
3. Use HTTPS (reverse proxy with TLS termination)
4. Set appropriate `CORS_ORIGINS`
5. Use external PostgreSQL and Redis for high availability
6. Set up database backups

## Development (No Docker)

### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL 16
- Redis 7

### Start databases
```bash
docker compose -f docker-compose.dev.yml up postgres redis -d
```

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Run Tests
```bash
cd backend && pytest
cd frontend && npm test
```
