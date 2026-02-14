import pytest
import pytest_asyncio
from httpx import AsyncClient


@pytest_asyncio.fixture(autouse=True)
async def _init_identity(db_engine):
    """Initialize server identity so well-known endpoint works."""
    from app.database import get_session_factory
    from app.federation.identity import init_server_identity

    factory = get_session_factory()
    async with factory() as session:
        await init_server_identity(session)


@pytest.mark.asyncio
async def test_well_known_endpoint(client: AsyncClient):
    response = await client.get("/.well-known/d3chat-server")
    assert response.status_code == 200
    data = response.json()
    assert data["domain"] == "localhost:8000"
    assert "signing_key_public" in data
    assert data["protocol_version"] == 1
    assert "api_base_url" in data


@pytest.mark.asyncio
async def test_well_known_returns_valid_base64_key(client: AsyncClient):
    import base64
    response = await client.get("/.well-known/d3chat-server")
    key_b64 = response.json()["signing_key_public"]
    # Should be valid base64 and decode to 32 bytes (Ed25519 public key)
    key_bytes = base64.b64decode(key_b64)
    assert len(key_bytes) == 32


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
