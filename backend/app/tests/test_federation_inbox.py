import json
import time
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.crypto.signing import generate_signing_keypair, load_signing_key, sign_request
from app.tests.conftest import fake_redis


def _make_signed_request(body_dict: dict, method="POST", path="/federation/inbox"):
    """Create signed federation headers for a test request."""
    seed, public = generate_signing_keypair()
    signing_key = load_signing_key(seed)
    timestamp = str(time.time())
    body = json.dumps(body_dict).encode()
    signature = sign_request(signing_key, method, path, timestamp, body)
    return {
        "body": body,
        "headers": {
            "Content-Type": "application/json",
            "X-D3Chat-Origin": "remote.test",
            "X-D3Chat-Timestamp": timestamp,
            "X-D3Chat-Signature": signature,
        },
        "public_key": public,
    }


@pytest.mark.asyncio
async def test_inbox_missing_headers(client: AsyncClient):
    response = await client.post(
        "/federation/inbox",
        content=b"{}",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 401
    assert "Missing federation headers" in response.json()["detail"]


@pytest.mark.asyncio
async def test_inbox_expired_timestamp(client: AsyncClient):
    seed, public = generate_signing_keypair()
    signing_key = load_signing_key(seed)
    old_ts = str(time.time() - 600)  # 10 minutes ago
    body = json.dumps({"event_id": "e1", "type": "message.relay"}).encode()
    sig = sign_request(signing_key, "POST", "/federation/inbox", old_ts, body)

    response = await client.post(
        "/federation/inbox",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-D3Chat-Origin": "remote.test",
            "X-D3Chat-Timestamp": old_ts,
            "X-D3Chat-Signature": sig,
        },
    )
    assert response.status_code == 401
    assert "replay window" in response.json()["detail"]


@pytest.mark.asyncio
async def test_inbox_bad_signature(client: AsyncClient):
    timestamp = str(time.time())
    body = json.dumps({"event_id": "e1", "type": "message.relay"}).encode()

    # Use a mock discover_server that returns a server with a different key
    from app.models.server import Server

    mock_server = Server(
        domain="remote.test",
        signing_key_public="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        verified=True,
    )

    with patch("app.federation.inbox.discover_server", new_callable=AsyncMock, return_value=mock_server):
        response = await client.post(
            "/federation/inbox",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-D3Chat-Origin": "remote.test",
                "X-D3Chat-Timestamp": timestamp,
                "X-D3Chat-Signature": "badsig==",
            },
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_inbox_valid_event(client: AsyncClient):
    """Test a valid federation event is accepted with proper signature."""
    import base64
    from app.models.server import Server

    seed, public = generate_signing_keypair()
    signing_key = load_signing_key(seed)
    public_b64 = base64.b64encode(public).decode()

    event = {
        "event_id": str(uuid.uuid4()),
        "type": "channel.join",
        "origin_server": "remote.test",
        "channel_id": str(uuid.uuid4()),
        "username": "remoteuser",
    }
    timestamp = str(time.time())
    body = json.dumps(event).encode()
    sig = sign_request(signing_key, "POST", "/federation/inbox", timestamp, body)

    mock_server = Server(
        domain="remote.test",
        signing_key_public=public_b64,
        verified=True,
    )

    # Reset dedup to allow through
    fake_redis.set.return_value = True

    with patch("app.federation.inbox.discover_server", new_callable=AsyncMock, return_value=mock_server):
        response = await client.post(
            "/federation/inbox",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-D3Chat-Origin": "remote.test",
                "X-D3Chat-Timestamp": timestamp,
                "X-D3Chat-Signature": sig,
            },
        )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_inbox_duplicate_event(client: AsyncClient):
    """Test that duplicate events are rejected via Redis SET NX."""
    import base64
    from app.models.server import Server

    seed, public = generate_signing_keypair()
    signing_key = load_signing_key(seed)
    public_b64 = base64.b64encode(public).decode()

    event = {
        "event_id": "dup-event-123",
        "type": "channel.join",
        "origin_server": "remote.test",
        "channel_id": str(uuid.uuid4()),
        "username": "remoteuser",
    }
    timestamp = str(time.time())
    body = json.dumps(event).encode()
    sig = sign_request(signing_key, "POST", "/federation/inbox", timestamp, body)

    mock_server = Server(
        domain="remote.test",
        signing_key_public=public_b64,
        verified=True,
    )

    # Simulate duplicate: SET NX returns False (key already exists)
    fake_redis.set.return_value = False

    with patch("app.federation.inbox.discover_server", new_callable=AsyncMock, return_value=mock_server):
        response = await client.post(
            "/federation/inbox",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-D3Chat-Origin": "remote.test",
                "X-D3Chat-Timestamp": timestamp,
                "X-D3Chat-Signature": sig,
            },
        )
    assert response.status_code == 200
    assert response.json()["status"] == "duplicate"

    # Reset
    fake_redis.set.return_value = True


@pytest.mark.asyncio
async def test_inbox_rate_limit(client: AsyncClient):
    """Test that exceeding the federation rate limit returns 429."""
    import base64
    from app.models.server import Server

    seed, public = generate_signing_keypair()
    signing_key = load_signing_key(seed)
    public_b64 = base64.b64encode(public).decode()

    event = {
        "event_id": str(uuid.uuid4()),
        "type": "channel.join",
        "origin_server": "remote.test",
        "channel_id": str(uuid.uuid4()),
        "username": "remoteuser",
    }
    timestamp = str(time.time())
    body = json.dumps(event).encode()
    sig = sign_request(signing_key, "POST", "/federation/inbox", timestamp, body)

    mock_server = Server(
        domain="remote.test",
        signing_key_public=public_b64,
        verified=True,
    )

    # Simulate rate limit exceeded
    fake_redis.incr.return_value = 999

    with patch("app.federation.inbox.discover_server", new_callable=AsyncMock, return_value=mock_server):
        response = await client.post(
            "/federation/inbox",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-D3Chat-Origin": "remote.test",
                "X-D3Chat-Timestamp": timestamp,
                "X-D3Chat-Signature": sig,
            },
        )
    assert response.status_code == 429

    # Reset
    fake_redis.incr.return_value = 1
