import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

import json

from app.config import get_settings
from app.redis_client import redis_client
from app.database import get_db, get_engine, get_session_factory
from app.routers import admin, auth, users, devices, channels, messages, keys, avatars, attachments
from app.websocket.router import router as ws_router
from app.middleware.rate_limit import RateLimitMiddleware
from app.federation.identity import init_server_identity, get_public_key_b64

APP_VERSION = "0.3.0"

logger = logging.getLogger("d3chat")


def run_migrations():
    """Run alembic migrations to head on startup via subprocess.

    Alembic's async env uses asyncio.run() which conflicts with uvicorn's
    already-running event loop, so we run it in a separate process.
    Uses sys.executable to ensure we use the same Python/venv as the app.
    """
    import subprocess
    import sys
    import os

    backend_dir = os.path.join(os.path.dirname(__file__), "..")
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=backend_dir,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Alembic migration failed:\n{result.stderr}")
    if result.stdout:
        logger.info(result.stdout.strip())


async def ensure_default_admin(session):
    """Create a default superadmin user if no superadmin exists."""
    from sqlalchemy import select
    from app.models.user import User
    from app.crypto.passwords import hash_password

    settings = get_settings()
    result = await session.execute(
        select(User).where(User.role == "superadmin", User.is_local == True)
    )
    if result.scalar_one_or_none():
        return  # A superadmin already exists

    admin_user = User(
        username="admin",
        password_hash=hash_password("Change_Me_123"),
        server_domain=settings.server_domain,
        is_local=True,
        role="superadmin",
    )
    session.add(admin_user)
    await session.commit()
    logger.info("Created default superadmin user 'admin' — change the password immediately")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"d3chat backend v{APP_VERSION} starting up")
    try:
        logger.info("Running database migrations...")
        run_migrations()
        logger.info("Migrations complete")
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise
    factory = get_session_factory()
    async with factory() as session:
        await init_server_identity(session)
    async with factory() as session:
        await ensure_default_admin(session)
    # Ensure uploads directory exists
    import os
    settings = get_settings()
    os.makedirs(os.path.join(settings.upload_dir, "avatars"), exist_ok=True)
    os.makedirs(os.path.join(settings.upload_dir, "attachments"), exist_ok=True)
    yield
    # Shutdown
    logger.info(f"d3chat backend v{APP_VERSION} shutting down")
    await get_engine().dispose()
    await redis_client.aclose()


def create_app() -> FastAPI:
    settings = get_settings()

    logging.basicConfig(level=logging.INFO)
    logger.info(f"d3chat backend v{APP_VERSION}")

    app = FastAPI(
        title="d3chat",
        description="Federated end-to-end encrypted chat",
        version=APP_VERSION,
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Rate limiting
    app.add_middleware(RateLimitMiddleware)

    # API routers
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
    app.include_router(devices.router, prefix="/api/v1/devices", tags=["devices"])
    app.include_router(channels.router, prefix="/api/v1/channels", tags=["channels"])
    app.include_router(messages.router, prefix="/api/v1/channels", tags=["messages"])
    app.include_router(keys.router, prefix="/api/v1/keys", tags=["keys"])
    app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
    app.include_router(avatars.router, prefix="/api/v1/avatars", tags=["avatars"])
    app.include_router(attachments.router, prefix="/api/v1", tags=["attachments"])

    # WebSocket
    app.include_router(ws_router)

    # Federation inbox
    from app.federation.inbox import router as federation_router
    app.include_router(federation_router, tags=["federation"])

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/v1/config")
    async def public_config(db: AsyncSession = Depends(get_db)):
        from sqlalchemy import select
        from app.models.server_settings import ServerSettings
        from app.schemas.admin import PublicConfigResponse

        # Try Redis cache first
        cache_key = "public_config"
        try:
            cached = await redis_client.get(cache_key)
            if cached:
                return PublicConfigResponse(**json.loads(cached))
        except Exception:
            pass

        # Query settings from DB
        public_keys = [
            "app_name", "app_description", "registration_mode",
            "brand_primary_color", "brand_accent_color",
        ]
        result = await db.execute(
            select(ServerSettings).where(ServerSettings.key.in_(public_keys))
        )
        settings_rows = result.scalars().all()
        settings_map = {s.key: s.value for s in settings_rows}

        def get_val(key: str, default: str) -> str:
            val = settings_map.get(key)
            if val and isinstance(val, dict) and "value" in val:
                return str(val["value"])
            return default

        config = PublicConfigResponse(
            app_name=get_val("app_name", "d3chat"),
            app_description=get_val("app_description", "Federated end-to-end encrypted chat"),
            registration_mode=get_val("registration_mode", "open"),
            brand_primary_color=get_val("brand_primary_color", "#3b82f6"),
            brand_accent_color=get_val("brand_accent_color", "#10b981"),
        )

        # Cache for 60 seconds
        try:
            await redis_client.setex(cache_key, 60, json.dumps(config.model_dump()))
        except Exception:
            pass

        return config

    @app.get("/.well-known/d3chat-server")
    async def well_known():
        return {
            "domain": settings.server_domain,
            "signing_key_public": get_public_key_b64(),
            "api_base_url": settings.api_base_url or f"http://{settings.server_domain}",
            "protocol_version": 1,
        }

    return app


app = create_app()
