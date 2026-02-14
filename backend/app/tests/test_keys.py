import pytest
from httpx import AsyncClient
from app.tests.conftest import fake_redis


@pytest.mark.asyncio
async def test_upload_key_bundle(auth_client):
    client, user_data = auth_client
    device_id = user_data["device_id"]
    response = await client.post(
        "/api/v1/keys/upload",
        json={
            "device_id": device_id,
            "identity_key": "id-key-b64",
            "signed_pre_key": "spk-b64",
            "signed_pre_key_signature": "spk-sig-b64",
            "one_time_pre_keys": ["otp1", "otp2", "otp3"],
        },
    )
    assert response.status_code == 201
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_upload_key_bundle_wrong_device(auth_client):
    client, _ = auth_client
    response = await client.post(
        "/api/v1/keys/upload",
        json={
            "device_id": "00000000-0000-0000-0000-000000000000",
            "identity_key": "key",
            "signed_pre_key": "spk",
            "signed_pre_key_signature": "sig",
        },
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_user_bundles(auth_client):
    client, user_data = auth_client
    device_id = user_data["device_id"]
    user_id = user_data["user_id"]
    # Upload bundle first
    await client.post(
        "/api/v1/keys/upload",
        json={
            "device_id": device_id,
            "identity_key": "id-key",
            "signed_pre_key": "spk",
            "signed_pre_key_signature": "sig",
            "one_time_pre_keys": ["otp1", "otp2"],
        },
    )
    response = await client.get(f"/api/v1/keys/{user_id}/bundles")
    assert response.status_code == 200
    bundles = response.json()
    assert len(bundles) == 1
    assert bundles[0]["identity_key"] == "id-key"
    assert bundles[0]["one_time_pre_key"] == "otp1"  # First OTP consumed


@pytest.mark.asyncio
async def test_get_device_bundle(auth_client):
    client, user_data = auth_client
    device_id = user_data["device_id"]
    await client.post(
        "/api/v1/keys/upload",
        json={
            "device_id": device_id,
            "identity_key": "dev-id-key",
            "signed_pre_key": "dev-spk",
            "signed_pre_key_signature": "dev-sig",
            "one_time_pre_keys": ["otp1"],
        },
    )
    response = await client.get(f"/api/v1/keys/{device_id}/bundle")
    assert response.status_code == 200
    data = response.json()
    assert data["identity_key"] == "dev-id-key"


@pytest.mark.asyncio
async def test_upload_one_time_keys(auth_client):
    client, user_data = auth_client
    device_id = user_data["device_id"]
    # Upload initial bundle
    await client.post(
        "/api/v1/keys/upload",
        json={
            "device_id": device_id,
            "identity_key": "id-key",
            "signed_pre_key": "spk",
            "signed_pre_key_signature": "sig",
            "one_time_pre_keys": ["existing"],
        },
    )
    response = await client.post(
        "/api/v1/keys/one-time",
        json={
            "device_id": device_id,
            "one_time_pre_keys": ["new1", "new2"],
        },
    )
    assert response.status_code == 201
    assert response.json()["count"] == 3  # existing + 2 new


@pytest.mark.asyncio
async def test_x3dh_setup_store_and_fetch(auth_client):
    client, _ = auth_client
    # Create a channel first
    ch = await client.post("/api/v1/channels", json={"name": "x3dh-ch"})
    channel_id = ch.json()["id"]

    # Configure fake_redis.set and get for x3dh
    import json
    x3dh_data = {
        "initiator_identity_key": "init-key",
        "ephemeral_public_key": "eph-key",
        "used_one_time_key": True,
    }
    fake_redis.set.return_value = True
    fake_redis.get.return_value = json.dumps(x3dh_data)

    # Store
    response = await client.post(
        f"/api/v1/keys/channels/{channel_id}/x3dh-setup",
        json=x3dh_data,
    )
    assert response.status_code == 201

    # Fetch
    response = await client.get(f"/api/v1/keys/channels/{channel_id}/x3dh-setup")
    assert response.status_code == 200
    data = response.json()
    assert data["initiator_identity_key"] == "init-key"
    assert data["ephemeral_public_key"] == "eph-key"
    assert data["used_one_time_key"] is True


@pytest.mark.asyncio
async def test_x3dh_setup_not_found(auth_client):
    client, _ = auth_client
    ch = await client.post("/api/v1/channels", json={"name": "no-x3dh"})
    channel_id = ch.json()["id"]
    fake_redis.get.return_value = None
    response = await client.get(f"/api/v1/keys/channels/{channel_id}/x3dh-setup")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_distribute_sender_key(auth_client):
    client, user_data = auth_client
    device_id = user_data["device_id"]
    ch = await client.post("/api/v1/channels", json={"name": "sk-ch"})
    channel_id = ch.json()["id"]
    response = await client.post(
        f"/api/v1/keys/channels/{channel_id}/sender-keys",
        json={
            "device_id": device_id,
            "sender_key_public": "sk-pub",
            "chain_key": "ck-b64",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["sender_key_public"] == "sk-pub"
    assert data["message_number"] == 0


@pytest.mark.asyncio
async def test_get_channel_sender_keys(auth_client):
    client, user_data = auth_client
    device_id = user_data["device_id"]
    ch = await client.post("/api/v1/channels", json={"name": "sk-list"})
    channel_id = ch.json()["id"]
    await client.post(
        f"/api/v1/keys/channels/{channel_id}/sender-keys",
        json={
            "device_id": device_id,
            "sender_key_public": "sk-pub",
            "chain_key": "ck-b64",
        },
    )
    response = await client.get(f"/api/v1/keys/channels/{channel_id}/sender-keys")
    assert response.status_code == 200
    keys = response.json()
    assert len(keys) == 1
    assert keys[0]["sender_key_public"] == "sk-pub"
