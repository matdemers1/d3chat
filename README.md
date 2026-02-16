# d3chat

A self-hostable, federated, end-to-end encrypted chat application. Built with a Signal-like trust model where server operators cannot read message content.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick Start (Docker)](#quick-start-docker)
- [Development Setup](#development-setup)
- [Configuration](#configuration)
- [Encryption & Security](#encryption--security)
- [Federation](#federation)
- [API Reference](#api-reference)
- [Admin Panel](#admin-panel)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Features

### Messaging
- **End-to-end encryption** — X3DH key exchange + AES-256-GCM for DMs, Sender Keys for group channels
- **Per-device keys** — Each device has its own identity; no server-side key recovery
- **Real-time messaging** — WebSocket connections with Redis pub/sub fan-out
- **Message history** — Paginated message loading with edit and delete support
- **Typing indicators** — Real-time typing status broadcasts
- **Direct messages & group channels** — Create DMs or named group channels with member management

### Federation
- **Server-to-server communication** — Servers discover and communicate via signed HTTP requests (Ed25519)
- **Cross-server DMs and groups** — Invite remote users into channels seamlessly
- **WebFinger discovery** — Standard-based server identity resolution
- **Cryptographic verification** — All federation requests are signed and verified

### User Profiles
- **Display names & avatars** — Upload profile pictures, set a display name shown across the app
- **Bio & status messages** — Short about text and ephemeral status visible to other users
- **Email privacy controls** — Choose whether your email is visible to others
- **Password management** — Change password with old-password verification (Argon2 hashing)

### Administration
- **Dashboard** — Real-time stats: total users, active users today, messages, channels
- **Analytics** — Daily charts for new users, active users, messages, and channels (up to 90 days)
- **User management** — Search, ban, suspend (with duration), promote roles, delete accounts
- **Channel management** — Browse all channels, view members, delete channels
- **Audit logging** — Every admin action logged with timestamp and IP address
- **Server settings** — Configure registration mode (open/closed/invite-only), email domain allowlists, branding

### Self-Hosting
- **Single command deployment** — `docker compose up` gets everything running
- **Production-ready** — Includes production Docker Compose with Cloudflare tunnel support
- **Customizable branding** — App name, description, and colors configurable via admin panel

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React 19 + TypeScript + Vite + Tailwind CSS v4)      │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────────┐  │
│  │  Zustand  │ │ Web      │ │ IndexedDB │ │ WebSocket Client │  │
│  │  Stores   │ │ Crypto   │ │ Key Store │ │ (Real-time)      │  │
│  └──────────┘ └──────────┘ └───────────┘ └──────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS / WSS
┌──────────────────────────────┴──────────────────────────────────┐
│  Backend (Python 3.12 + FastAPI + SQLAlchemy Async)             │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────────┐  │
│  │  Auth &   │ │ Channel  │ │ Key Mgmt  │ │   Federation     │  │
│  │  Users    │ │ Messages │ │ (X3DH)    │ │   (Ed25519)      │  │
│  └──────────┘ └──────────┘ └───────────┘ └──────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────────┐  │
│  │ WebSocket│ │  Admin   │ │  Rate     │ │   Alembic        │  │
│  │ Manager  │ │  Panel   │ │  Limiter  │ │   Migrations     │  │
│  └──────────┘ └──────────┘ └───────────┘ └──────────────────┘  │
└──────────┬──────────────────────────┬───────────────────────────┘
           │                          │
    ┌──────┴──────┐           ┌───────┴───────┐
    │ PostgreSQL  │           │    Redis      │
    │   16        │           │    7          │
    │ (Data)      │           │ (Pub/Sub +    │
    │             │           │  Cache)       │
    └─────────────┘           └───────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Zustand |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2 |
| **Database** | PostgreSQL 16 (asyncpg) |
| **Cache / Pub-Sub** | Redis 7 |
| **Client-side Crypto** | Web Crypto API (P-256 ECDH, AES-256-GCM, ECDSA) |
| **Server-side Crypto** | PyNaCl (Ed25519 federation signing), Argon2 (passwords) |
| **Auth** | JWT access tokens + rotating refresh tokens |
| **Containerization** | Docker, multi-stage builds, Nginx reverse proxy |

## Quick Start (Docker)

```bash
git clone https://github.com/matdemers1/d3chat.git
cd d3chat
cp .env.example .env
# Edit .env — at minimum, change SECRET_KEY
docker compose up --build
```

- **Frontend**: http://localhost:3000
- **Backend API docs**: http://localhost:8000/docs
- **Backend ReDoc**: http://localhost:8000/redoc

The first user to register can be promoted to admin via the database or by another superadmin.

## Development Setup

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16
- Redis 7

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"

# Set up environment
cp ../.env.example ../.env
# Edit ../.env with your local database and Redis URLs

# Run migrations
alembic upgrade head

# Start the server
uvicorn app.main:app --reload
```

The API will be available at http://localhost:8000 with interactive docs at `/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server starts at http://localhost:5173 with hot module replacement.

### Running Both

In development, you'll need separate terminals for the backend and frontend. Make sure PostgreSQL and Redis are running locally (or via the infra-only compose file):

```bash
# Start just the database and Redis
docker compose -f docker-compose.infra.yml up -d

# Terminal 1: Backend
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload

# Terminal 2: Frontend
cd frontend && npm run dev
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string (asyncpg) |
| `REDIS_URL` | — | Redis connection string |
| `SECRET_KEY` | — | JWT signing secret. Generate with `openssl rand -base64 48` |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token lifetime |
| `SERVER_DOMAIN` | — | Public domain of this server (used for federation identity) |
| `SIGNING_KEY_SEED` | — | Hex-encoded 32-byte Ed25519 seed for federation signing. Generate with `openssl rand -hex 32` |
| `API_BASE_URL` | — | Public API URL (for federation callbacks) |
| `CORS_ORIGINS` | — | JSON array of allowed CORS origins |
| `UPLOAD_DIR` | `uploads` | Directory for avatar storage |
| `MAX_AVATAR_SIZE_BYTES` | `2097152` | Max avatar upload size (default 2MB) |
| `RATE_LIMIT_PER_MINUTE` | `300` | API rate limit per user per minute |
| `VITE_API_URL` | — | Frontend: Backend API base URL |
| `VITE_WS_URL` | — | Frontend: WebSocket endpoint URL |

### Admin-Configurable Settings

These are managed through the admin panel at runtime:

- **Registration mode** — `open`, `closed`, or `invite_only`
- **Email domain allowlist** — Restrict registration to specific email domains
- **App name & description** — Displayed on login/register pages
- **Brand colors** — Primary and accent colors for theming

## Encryption & Security

### Trust Model

d3chat follows a **Signal-like trust model**: the server facilitates key exchange and message routing, but **cannot decrypt message content**. All encryption and decryption happens client-side in the browser using the Web Crypto API.

### Key Management

- **Identity keys** — Each device generates a P-256 ECDH identity key pair, stored in the browser's IndexedDB
- **Signed pre-keys** — Rotatable keys signed by the identity key (ECDSA), used for asynchronous key exchange
- **One-time pre-keys** — Single-use keys consumed during X3DH handshake; server alerts when supply is low

### DM Encryption (X3DH + AES-256-GCM)

1. Initiator fetches recipient's key bundle (identity key, signed pre-key, one-time pre-key)
2. X3DH key agreement derives a shared secret
3. HKDF expands the shared secret into an AES-256-GCM encryption key
4. Each message is encrypted with a unique IV
5. Protocol version `2` in messages indicates E2E encryption

### Group Encryption (Sender Keys)

1. Each device generates a sender key pair for the channel
2. Sender keys are distributed to all channel members
3. Messages are encrypted using the sender's key with chain ratcheting
4. New members receive current sender keys; key rotation happens on member changes

### Password Security

- Passwords are hashed with **Argon2** (memory-hard, resistant to GPU attacks)
- Minimum 8 characters, maximum 128 characters
- Password changes require verification of the old password

### Session Security

- Access tokens (JWT) expire after 15 minutes by default
- Refresh tokens are stored as SHA-256 hashes in the database
- Token rotation on every refresh — old tokens are invalidated
- Logout invalidates the refresh token; logout-all clears every session

## Federation

Federation allows users on different d3chat servers to communicate. Each server has an Ed25519 identity used to sign all outbound requests.

### How It Works

1. **Discovery** — Server A looks up Server B via WebFinger (`/.well-known/webfinger`)
2. **Verification** — Server B's public signing key is fetched and stored
3. **Communication** — All requests between servers are signed with Ed25519:
   ```
   Signature = Ed25519(method + path + timestamp + SHA256(body))
   Headers: X-Signature, X-Timestamp, X-Server-Domain
   ```
4. **Events** — Servers exchange events through their federation inbox (`/federation/inbox`):
   - `message.relay` — Deliver a message to a remote user
   - `channel.invite` — Invite a remote user to a channel
   - `channel.join` / `channel.leave` — Membership updates
   - `sender_key.distribute` — Share group encryption keys

### Setting Up Federation

1. Set a public `SERVER_DOMAIN` (e.g., `chat.example.com`)
2. Generate a persistent `SIGNING_KEY_SEED` with `openssl rand -hex 32`
3. Set `API_BASE_URL` to your public HTTPS URL
4. Ensure `/.well-known/`, `/federation/`, and `/api/` paths are accessible

Federation is automatic — when you add a remote user (e.g., `alice@other-server.com`) to a channel, the servers discover each other and begin communicating.

## API Reference

The backend exposes a full REST API with interactive documentation:

- **Swagger UI**: `http://your-server:8000/docs`
- **ReDoc**: `http://your-server:8000/redoc`

### Endpoint Groups

| Prefix | Description |
|--------|-------------|
| `/api/v1/auth` | Registration, login, token refresh, logout, WebSocket tickets |
| `/api/v1/users` | User profiles, search, avatar upload, password management |
| `/api/v1/channels` | Channel CRUD, membership, DM creation |
| `/api/v1/channels/{id}/messages` | Send, edit, delete, paginate messages |
| `/api/v1/devices` | Device registration and management |
| `/api/v1/keys` | Key bundle upload/retrieval, X3DH setup, sender keys |
| `/api/v1/avatars` | Serve user avatar images (public, no auth) |
| `/api/v1/admin` | Dashboard stats, user/channel management, audit logs, settings |
| `/federation/inbox` | Inbound federation events |
| `/ws` | WebSocket endpoint (authenticated via one-time ticket) |
| `/.well-known/webfinger` | Federation server discovery |

### WebSocket Events

Connect via `/ws?ticket=<ticket>` (obtain ticket from `POST /api/v1/auth/ws-ticket`).

**Inbound (server → client):**

| Event | Description |
|-------|-------------|
| `message.new` | New message in a subscribed channel |
| `message.edit` | Message was edited |
| `message.delete` | Message was deleted |
| `typing.start` / `typing.stop` | User started/stopped typing |
| `channel.new` | You were added to a new channel |
| `keys.low_otp` | One-time pre-key supply is low |

**Outbound (client → server):**

| Event | Description |
|-------|-------------|
| `typing.start` / `typing.stop` | Broadcast typing status to a channel |
| `presence.update` | Update online status (online/away/offline) |
| `subscribe` | Subscribe to additional channel events |

## Admin Panel

The admin panel is available at `/admin` for users with the `admin` or `superadmin` role.

### Pages

- **Dashboard** — Overview stats and analytics charts (new users, active users, messages, channels over time)
- **Users** — Search, filter by role/status, view user details (device count, session count, channel/message counts), ban/suspend/promote/delete
- **Channels** — Browse all channels and DMs, view members, delete channels
- **Audit Logs** — Searchable log of all admin actions with timestamps and IP addresses
- **Settings** — Configure registration mode, email domain allowlists, app branding (name, description, colors)

### Role Hierarchy

| Role | Capabilities |
|------|-------------|
| `member` | Standard user — chat, create channels, manage own profile |
| `admin` | All member capabilities + user management, channel management, view audit logs |
| `superadmin` | All admin capabilities + change server settings, promote/demote users, delete users |

## Deployment

### Production with Docker Compose

```bash
cp .env.prod.example .env
# Edit .env with production values:
#   - POSTGRES_PASSWORD (openssl rand -base64 32)
#   - SECRET_KEY (openssl rand -base64 48)
#   - SIGNING_KEY_SEED (openssl rand -hex 32)
#   - CLOUDFLARE_TUNNEL_TOKEN (from Cloudflare Zero Trust dashboard)

docker compose -f docker-compose.prod.yml up --build -d
```

The production compose file includes:
- **Cloudflare tunnel** for HTTPS termination and DDoS protection
- **Automatic restarts** (`unless-stopped`) for all services
- **Persistent PostgreSQL volume** for data durability

### Production Checklist

- [ ] Generate strong, unique values for `SECRET_KEY`, `POSTGRES_PASSWORD`, and `SIGNING_KEY_SEED`
- [ ] Set `SERVER_DOMAIN` to your public domain (e.g., `chat.example.com`)
- [ ] Set `API_BASE_URL` to your public HTTPS URL
- [ ] Configure `CORS_ORIGINS` to match your frontend domain
- [ ] Set up a reverse proxy with TLS (Cloudflare tunnel, Nginx + Let's Encrypt, Caddy, etc.)
- [ ] Ensure `/.well-known/` and `/federation/` paths are publicly accessible (for federation)
- [ ] Mount a persistent volume for the `uploads/` directory (avatars)
- [ ] Set up database backups

### Custom Reverse Proxy

If not using Cloudflare tunnels, ensure your reverse proxy:
- Forwards `/api/` and `/federation/` to the backend (port 8000)
- Upgrades `/ws` connections to WebSocket with appropriate timeouts
- Serves the frontend static files for all other paths (with SPA fallback to `index.html`)
- Forwards `/.well-known/` to the backend for federation discovery

The included `frontend/nginx.conf` handles this when running inside Docker.

## Project Structure

```
d3chat/
├── backend/
│   ├── app/
│   │   ├── crypto/              # Passwords (Argon2), JWT tokens, Ed25519 signing
│   │   ├── federation/          # Server discovery, signed requests, event handlers
│   │   ├── models/              # SQLAlchemy models (User, Channel, Message, Device, etc.)
│   │   ├── routers/             # FastAPI route handlers
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── websocket/           # WebSocket manager and connection handling
│   │   ├── config.py            # Application settings (Pydantic BaseSettings)
│   │   ├── database.py          # Async SQLAlchemy session setup
│   │   ├── dependencies.py      # Auth dependencies (get_current_user, etc.)
│   │   ├── main.py              # FastAPI app entry point
│   │   └── redis_client.py      # Redis connection management
│   ├── alembic/                 # Database migrations
│   │   └── versions/            # Migration scripts (001-005)
│   ├── tests/                   # Pytest test suite
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── api/                 # HTTP client and WebSocket client
│   │   ├── components/          # React components
│   │   │   ├── admin/           # Admin layout
│   │   │   ├── chat/            # MessageInput, MessageList, NewDMDialog
│   │   │   ├── common/          # Avatar, ParticleNetwork
│   │   │   ├── layout/          # Sidebar
│   │   │   └── users/           # ProfileModal, UserProfileCard
│   │   ├── crypto/              # Client-side encryption (X3DH, AES, Sender Keys, etc.)
│   │   ├── pages/               # Route pages (Login, Register, Chat, Admin/*)
│   │   ├── store/               # Zustand state stores (auth, chat, admin, branding)
│   │   └── types/               # TypeScript type definitions
│   ├── Dockerfile               # Multi-stage build (Node → Nginx)
│   ├── nginx.conf               # Nginx config with API/WS/federation proxying
│   └── package.json
├── docker-compose.yml           # Development environment
├── docker-compose.prod.yml      # Production with Cloudflare tunnel
├── docker-compose.infra.yml     # Database + Redis only
├── .env.example                 # Development environment template
└── .env.prod.example            # Production environment template
```

## Testing

### Backend Tests

```bash
cd backend
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

The test suite uses `aiosqlite` for an in-memory database and mock Redis, so no external services are needed.

**Test coverage includes:**
- Authentication (register, login, refresh, logout)
- User profiles and search
- Device management
- Channel CRUD and membership
- Message send, edit, delete, pagination
- Key bundle management
- Rate limiting
- Federation identity, handlers, inbox, and cryptographic signatures

### Frontend Type Checking

```bash
cd frontend
npx tsc --noEmit
```

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run the backend tests (`pytest`) and frontend type checks (`npx tsc --noEmit`)
5. Commit your changes and open a pull request

Please keep PRs focused — one feature or fix per PR. If you're planning a large change, open an issue first to discuss the approach.

### Areas for Contribution

- Mobile clients (React Native, Flutter)
- File/image sharing with E2E encryption
- Voice/video calls
- Message reactions and threads
- Improved federation protocol documentation
- Accessibility improvements
- Internationalization (i18n)

## License

This project is licensed under the [MIT License](LICENSE).
