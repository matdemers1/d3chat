import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.redis_client import redis_client
from app.database import get_engine, get_session_factory
from app.routers import auth, users, devices, channels, messages, keys
from app.websocket.router import router as ws_router
from app.middleware.rate_limit import RateLimitMiddleware
from app.federation.identity import init_server_identity, get_public_key_b64

APP_VERSION = "0.3.0"

logger = logging.getLogger("d3chat")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"d3chat backend v{APP_VERSION} starting up")
    factory = get_session_factory()
    async with factory() as session:
        await init_server_identity(session)
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

    # WebSocket
    app.include_router(ws_router)

    # Federation inbox
    from app.federation.inbox import router as federation_router
    app.include_router(federation_router, tags=["federation"])

    @app.get("/health")
    async def health():
        return {"status": "ok"}

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
