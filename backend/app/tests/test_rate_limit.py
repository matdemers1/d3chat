import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.tests.conftest import fake_redis


@pytest_asyncio.fixture(autouse=True)
async def _init_identity(db_engine):
    """Initialize server identity so well-known endpoint works."""
    from app.database import get_session_factory
    from app.federation.identity import init_server_identity

    factory = get_session_factory()
    async with factory() as session:
        await init_server_identity(session)


@pytest.mark.asyncio
async def test_rate_limit_triggers(auth_client):
    """IP rate limit should return 429 when threshold exceeded."""
    client, _ = auth_client

    # Simulate hitting the rate limit: make Redis incr return a high count
    fake_redis.incr.return_value = 9999

    response = await client.get("/api/v1/users/me")
    assert response.status_code == 429
    assert "Rate limit" in response.json()["detail"]

    # Reset
    fake_redis.incr.return_value = 1


@pytest.mark.asyncio
async def test_rate_limit_normal_request(auth_client):
    """Normal requests under the limit should succeed."""
    client, _ = auth_client
    fake_redis.incr.return_value = 1
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_federation_paths_bypass_rate_limit(client: AsyncClient):
    """Federation paths should bypass the IP rate limit middleware."""
    fake_redis.incr.return_value = 9999

    # Federation inbox should NOT get 429 from IP rate limiter
    # (it may get 401 from missing headers, but not 429 from middleware)
    response = await client.post(
        "/federation/inbox",
        content=b"{}",
        headers={"Content-Type": "application/json"},
    )
    # Should be 401 (missing federation headers), not 429
    assert response.status_code == 401

    # Reset
    fake_redis.incr.return_value = 1


@pytest.mark.asyncio
async def test_well_known_bypasses_rate_limit(client: AsyncClient):
    """/.well-known/ should bypass the rate limit."""
    fake_redis.incr.return_value = 9999

    response = await client.get("/.well-known/d3chat-server")
    assert response.status_code == 200

    # Reset
    fake_redis.incr.return_value = 1


@pytest.mark.asyncio
async def test_health_bypasses_rate_limit(client: AsyncClient):
    """/health should bypass the rate limit."""
    fake_redis.incr.return_value = 9999

    response = await client.get("/health")
    assert response.status_code == 200

    # Reset
    fake_redis.incr.return_value = 1
