import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_channel(auth_client):
    client, _ = auth_client
    response = await client.post("/api/v1/channels", json={"name": "general"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "general"
    assert data["is_dm"] is False
    assert data["encryption_type"] == "sender_keys"


@pytest.mark.asyncio
async def test_list_channels(auth_client):
    client, _ = auth_client
    await client.post("/api/v1/channels", json={"name": "ch1"})
    await client.post("/api/v1/channels", json={"name": "ch2"})
    response = await client.get("/api/v1/channels")
    assert response.status_code == 200
    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_get_channel(auth_client):
    client, _ = auth_client
    ch = await client.post("/api/v1/channels", json={"name": "test-ch"})
    channel_id = ch.json()["id"]
    response = await client.get(f"/api/v1/channels/{channel_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "test-ch"


@pytest.mark.asyncio
async def test_update_channel(auth_client):
    client, _ = auth_client
    ch = await client.post("/api/v1/channels", json={"name": "old-name"})
    channel_id = ch.json()["id"]
    response = await client.patch(f"/api/v1/channels/{channel_id}", json={"name": "new-name"})
    assert response.status_code == 200
    assert response.json()["name"] == "new-name"


@pytest.mark.asyncio
async def test_delete_channel_owner(auth_client):
    client, _ = auth_client
    ch = await client.post("/api/v1/channels", json={"name": "to-delete"})
    channel_id = ch.json()["id"]
    response = await client.delete(f"/api/v1/channels/{channel_id}")
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_channel_non_owner(auth_client, second_auth_client):
    client, _ = auth_client
    client2, _ = second_auth_client
    ch = await client.post("/api/v1/channels", json={"name": "owned"})
    channel_id = ch.json()["id"]
    # Second user joins
    await client2.post(f"/api/v1/channels/{channel_id}/join")
    # Second user tries to delete — should fail
    response = await client2.delete(f"/api/v1/channels/{channel_id}")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_join_channel(auth_client, second_auth_client):
    client, _ = auth_client
    client2, _ = second_auth_client
    ch = await client.post("/api/v1/channels", json={"name": "joinable"})
    channel_id = ch.json()["id"]
    response = await client2.post(f"/api/v1/channels/{channel_id}/join")
    assert response.status_code == 204
    # Verify they can now see the channel
    ch_resp = await client2.get(f"/api/v1/channels/{channel_id}")
    assert ch_resp.status_code == 200


@pytest.mark.asyncio
async def test_join_channel_idempotent(auth_client):
    client, _ = auth_client
    ch = await client.post("/api/v1/channels", json={"name": "idem"})
    channel_id = ch.json()["id"]
    # Already a member (creator), joining again should be fine
    response = await client.post(f"/api/v1/channels/{channel_id}/join")
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_leave_channel(auth_client, second_auth_client):
    client, _ = auth_client
    client2, _ = second_auth_client
    ch = await client.post("/api/v1/channels", json={"name": "leavable"})
    channel_id = ch.json()["id"]
    await client2.post(f"/api/v1/channels/{channel_id}/join")
    response = await client2.post(f"/api/v1/channels/{channel_id}/leave")
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_list_members(auth_client):
    client, _ = auth_client
    ch = await client.post("/api/v1/channels", json={"name": "members-ch"})
    channel_id = ch.json()["id"]
    response = await client.get(f"/api/v1/channels/{channel_id}/members")
    assert response.status_code == 200
    members = response.json()
    assert len(members) == 1
    assert members[0]["role"] == "owner"


@pytest.mark.asyncio
async def test_add_member(auth_client, second_auth_client):
    client, _ = auth_client
    _, user2_data = second_auth_client
    ch = await client.post("/api/v1/channels", json={"name": "add-member"})
    channel_id = ch.json()["id"]
    response = await client.post(
        f"/api/v1/channels/{channel_id}/members",
        json={"user_id": user2_data["user_id"]},
    )
    assert response.status_code == 201
    assert response.json()["username"] == "seconduser"


@pytest.mark.asyncio
async def test_add_member_duplicate(auth_client, second_auth_client):
    client, _ = auth_client
    _, user2_data = second_auth_client
    ch = await client.post("/api/v1/channels", json={"name": "dup-member"})
    channel_id = ch.json()["id"]
    await client.post(
        f"/api/v1/channels/{channel_id}/members",
        json={"user_id": user2_data["user_id"]},
    )
    response = await client.post(
        f"/api/v1/channels/{channel_id}/members",
        json={"user_id": user2_data["user_id"]},
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_add_member_to_dm_rejected(auth_client, second_auth_client):
    client, _ = auth_client
    _, user2_data = second_auth_client
    dm = await client.post("/api/v1/channels/dm", json={"user_id": user2_data["user_id"]})
    channel_id = dm.json()["id"]
    response = await client.post(
        f"/api/v1/channels/{channel_id}/members",
        json={"user_id": user2_data["user_id"]},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_dm(auth_client, second_auth_client):
    client, _ = auth_client
    _, user2_data = second_auth_client
    response = await client.post("/api/v1/channels/dm", json={"user_id": user2_data["user_id"]})
    assert response.status_code == 201
    data = response.json()
    assert data["is_dm"] is True
    assert data["encryption_type"] == "x3dh"


@pytest.mark.asyncio
async def test_create_dm_idempotent(auth_client, second_auth_client):
    client, _ = auth_client
    _, user2_data = second_auth_client
    dm1 = await client.post("/api/v1/channels/dm", json={"user_id": user2_data["user_id"]})
    dm2 = await client.post("/api/v1/channels/dm", json={"user_id": user2_data["user_id"]})
    assert dm1.json()["id"] == dm2.json()["id"]


@pytest.mark.asyncio
async def test_non_member_access_denied(auth_client, second_auth_client):
    client, _ = auth_client
    client2, _ = second_auth_client
    ch = await client.post("/api/v1/channels", json={"name": "private"})
    channel_id = ch.json()["id"]
    response = await client2.get(f"/api/v1/channels/{channel_id}")
    assert response.status_code == 403
