import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_device(auth_client):
    client, _ = auth_client
    response = await client.post(
        "/api/v1/devices",
        json={"device_name": "my-phone"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["device_name"] == "my-phone"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_devices(auth_client):
    client, user_data = auth_client
    # There's already 1 device from registration
    response = await client.get("/api/v1/devices")
    assert response.status_code == 200
    devices = response.json()
    assert len(devices) >= 1
    assert devices[0]["id"] == user_data["device_id"]


@pytest.mark.asyncio
async def test_register_multiple_devices(auth_client):
    client, _ = auth_client
    await client.post("/api/v1/devices", json={"device_name": "phone"})
    await client.post("/api/v1/devices", json={"device_name": "tablet"})
    response = await client.get("/api/v1/devices")
    assert response.status_code == 200
    assert len(response.json()) == 3  # 1 from registration + 2 new


@pytest.mark.asyncio
async def test_revoke_device(auth_client):
    client, _ = auth_client
    dev = await client.post("/api/v1/devices", json={"device_name": "temp"})
    device_id = dev.json()["id"]
    response = await client.delete(f"/api/v1/devices/{device_id}")
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_revoke_device_not_found(auth_client):
    client, _ = auth_client
    response = await client.delete("/api/v1/devices/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
