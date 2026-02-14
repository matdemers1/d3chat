import os
import tempfile
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Create a temp file for the test database
_test_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_test_db_path = _test_db.name
_test_db.close()

_db_url = f"sqlite+aiosqlite:///{_test_db_path}"

os.environ["DATABASE_URL"] = _db_url
os.environ["REDIS_URL"] = "redis://localhost:6379/1"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["SERVER_DOMAIN"] = "localhost:8000"
os.environ["SIGNING_KEY_SEED"] = "a" * 64  # deterministic 32-byte hex seed for tests

# Mock redis before importing app modules
fake_redis = MagicMock()
fake_redis.publish = AsyncMock(return_value=0)
fake_redis.setex = AsyncMock(return_value=True)
fake_redis.getdel = AsyncMock(return_value=None)
fake_redis.delete = AsyncMock(return_value=0)
fake_redis.incr = AsyncMock(return_value=1)
fake_redis.expire = AsyncMock(return_value=True)
fake_redis.aclose = AsyncMock()
fake_redis.set = AsyncMock(return_value=True)
fake_redis.get = AsyncMock(return_value=None)

import app.redis_client
app.redis_client.redis_client = fake_redis

from app.database import Base, get_db, set_engine
from app.redis_client import get_redis
import app.models  # noqa: F401 — register all models with Base.metadata


async def override_get_redis():
    return fake_redis


@pytest_asyncio.fixture(autouse=True)
async def db_engine():
    """Create a fresh engine per test to avoid aiosqlite event loop issues."""
    engine = create_async_engine(_db_url)
    set_engine(engine)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_engine):
    from app.database import get_session_factory

    session_factory = get_session_factory()

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    from app.main import create_app
    application = create_app()
    application.dependency_overrides[get_db] = override_get_db
    application.dependency_overrides[get_redis] = override_get_redis
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient):
    """Returns (client, user_data) with pre-authenticated user."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "password": "testpassword123",
            "device_name": "test-device",
        },
    )
    data = response.json()
    client.headers["Authorization"] = f"Bearer {data['access_token']}"
    return client, data


@pytest_asyncio.fixture
async def second_auth_client(client: AsyncClient):
    """Returns (client, user_data) for a second authenticated user.
    Uses separate headers dict so both users can coexist on the same client."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "seconduser",
            "password": "testpassword456",
            "device_name": "second-device",
        },
    )
    data = response.json()
    # Return a new AsyncClient with the same transport but different auth
    from app.main import create_app
    from app.database import get_session_factory

    session_factory = get_session_factory()

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    application = create_app()
    application.dependency_overrides[get_db] = override_get_db
    application.dependency_overrides[get_redis] = override_get_redis
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ac.headers["Authorization"] = f"Bearer {data['access_token']}"
        yield ac, data
