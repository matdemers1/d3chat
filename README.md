# d3chat v1.0.0

A federated, end-to-end encrypted chat application. Signal-like trust model — server operators cannot read message content.

## Features

- **End-to-end encryption**: X25519 ECDH + AES-256-GCM for DMs, Sender Keys for groups
- **Federation**: Servers communicate via signed HTTP requests (Ed25519)
- **Per-device keys**: Each device has its own identity — no server-side key recovery
- **Real-time**: WebSocket messaging with Redis pub/sub fan-out
- **Self-hostable**: Docker-ready, single `docker compose up`

## Quick Start (Docker)

```bash
cp .env.example .env
# Edit .env with your settings
docker compose up
```

Frontend: http://localhost:3000
Backend API: http://localhost:8000/docs

## Development (no Docker)

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16
- Redis 7

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

## Architecture

- **Backend**: Python 3.12, FastAPI, SQLAlchemy async, asyncpg
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Zustand
- **Database**: PostgreSQL 16
- **Cache/Pub-Sub**: Redis 7
- **Encryption**: Web Crypto API (client-side), PyNaCl (server signing)

## License

MIT
