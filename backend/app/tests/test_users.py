import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_me(auth_client):
    client, user_data = auth_client
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert data["is_local"] is True
    assert data["server_domain"] == "localhost:8000"


@pytest.mark.asyncio
async def test_get_me_unauthenticated(client: AsyncClient):
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_update_me_username(auth_client):
    client, _ = auth_client
    response = await client.patch("/api/v1/users/me", json={"username": "newname"})
    assert response.status_code == 200
    assert response.json()["username"] == "newname"


@pytest.mark.asyncio
async def test_update_me_email(auth_client):
    client, _ = auth_client
    response = await client.patch("/api/v1/users/me", json={"email": "test@example.com"})
    assert response.status_code == 200
    assert response.json()["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_search_users(auth_client):
    client, _ = auth_client
    response = await client.get("/api/v1/users/search?q=test")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert any(u["username"] == "testuser" for u in data)


@pytest.mark.asyncio
async def test_search_users_no_results(auth_client):
    client, _ = auth_client
    response = await client.get("/api/v1/users/search?q=nonexistent_xyz")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_search_users_min_length(auth_client):
    client, _ = auth_client
    response = await client.get("/api/v1/users/search?q=")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_lookup_user_local(auth_client):
    client, _ = auth_client
    response = await client.get("/api/v1/users/lookup?identity=testuser@localhost:8000")
    assert response.status_code == 200
    assert response.json()["username"] == "testuser"


@pytest.mark.asyncio
async def test_lookup_user_bad_format(auth_client):
    client, _ = auth_client
    response = await client.get("/api/v1/users/lookup?identity=natsign")
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_lookup_user_not_found(auth_client):
    client, _ = auth_client
    response = await client.get("/api/v1/users/lookup?identity=nobody@localhost:8000")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_user_by_id(auth_client):
    client, user_data = auth_client
    user_id = user_data["user_id"]
    response = await client.get(f"/api/v1/users/{user_id}")
    assert response.status_code == 200
    assert response.json()["username"] == "testuser"


@pytest.mark.asyncio
async def test_get_user_by_id_not_found(auth_client):
    client, _ = auth_client
    response = await client.get("/api/v1/users/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
