import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "newuser",
            "password": "password123",
            "device_name": "my-device",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert "user_id" in data
    assert "device_id" in data


@pytest.mark.asyncio
async def test_register_duplicate(client: AsyncClient):
    body = {"username": "dupeuser", "password": "password123"}
    await client.post("/api/v1/auth/register", json=body)
    response = await client.post("/api/v1/auth/register", json=body)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_login(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={"username": "loginuser", "password": "password123"},
    )
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "loginuser", "password": "password123"},
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={"username": "wrongpw", "password": "password123"},
    )
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "wrongpw", "password": "wrongpassword"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me(auth_client):
    client, user_data = auth_client
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 200
    assert response.json()["username"] == "testuser"


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient):
    reg = await client.post(
        "/api/v1/auth/register",
        json={"username": "refreshuser", "password": "password123"},
    )
    refresh_token = reg.json()["refresh_token"]
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


@pytest.mark.asyncio
async def test_create_channel(auth_client):
    client, _ = auth_client
    response = await client.post(
        "/api/v1/channels",
        json={"name": "general"},
    )
    assert response.status_code == 201
    assert response.json()["name"] == "general"


@pytest.mark.asyncio
async def test_send_and_get_messages(auth_client):
    client, _ = auth_client
    ch = await client.post("/api/v1/channels", json={"name": "test-channel"})
    channel_id = ch.json()["id"]

    msg = await client.post(
        f"/api/v1/channels/{channel_id}/messages",
        json={"content": "Hello, world!"},
    )
    assert msg.status_code == 201

    msgs = await client.get(f"/api/v1/channels/{channel_id}/messages")
    assert msgs.status_code == 200
    assert len(msgs.json()["messages"]) == 1
    assert msgs.json()["messages"][0]["content"] == "Hello, world!"
