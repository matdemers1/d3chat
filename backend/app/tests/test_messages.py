import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_send_message(auth_client):
    client, _ = auth_client
    ch = await client.post("/api/v1/channels", json={"name": "msg-ch"})
    channel_id = ch.json()["id"]
    response = await client.post(
        f"/api/v1/channels/{channel_id}/messages",
        json={"content": "Hello!"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["content"] == "Hello!"
    assert data["content_type"] == "text"
    assert data["protocol_version"] == 1


@pytest.mark.asyncio
async def test_get_messages(auth_client):
    client, _ = auth_client
    ch = await client.post("/api/v1/channels", json={"name": "msgs"})
    channel_id = ch.json()["id"]
    await client.post(f"/api/v1/channels/{channel_id}/messages", json={"content": "msg1"})
    await client.post(f"/api/v1/channels/{channel_id}/messages", json={"content": "msg2"})
    response = await client.get(f"/api/v1/channels/{channel_id}/messages")
    assert response.status_code == 200
    data = response.json()
    assert len(data["messages"]) == 2
    assert data["has_more"] is False


@pytest.mark.asyncio
async def test_get_messages_pagination(auth_client):
    client, _ = auth_client
    ch = await client.post("/api/v1/channels", json={"name": "paginated"})
    channel_id = ch.json()["id"]
    for i in range(5):
        await client.post(f"/api/v1/channels/{channel_id}/messages", json={"content": f"msg{i}"})
    response = await client.get(f"/api/v1/channels/{channel_id}/messages?limit=3")
    assert response.status_code == 200
    data = response.json()
    assert len(data["messages"]) == 3
    assert data["has_more"] is True


@pytest.mark.asyncio
async def test_edit_message_own(auth_client):
    client, _ = auth_client
    ch = await client.post("/api/v1/channels", json={"name": "edit-ch"})
    channel_id = ch.json()["id"]
    msg = await client.post(f"/api/v1/channels/{channel_id}/messages", json={"content": "original"})
    message_id = msg.json()["id"]
    response = await client.patch(
        f"/api/v1/channels/messages/{message_id}",
        json={"content": "edited"},
    )
    assert response.status_code == 200
    assert response.json()["content"] == "edited"
    assert response.json()["edited_at"] is not None


@pytest.mark.asyncio
async def test_edit_message_other_user(auth_client, second_auth_client):
    client, _ = auth_client
    client2, _ = second_auth_client
    ch = await client.post("/api/v1/channels", json={"name": "edit-deny"})
    channel_id = ch.json()["id"]
    await client2.post(f"/api/v1/channels/{channel_id}/join")
    msg = await client.post(f"/api/v1/channels/{channel_id}/messages", json={"content": "mine"})
    message_id = msg.json()["id"]
    response = await client2.patch(
        f"/api/v1/channels/messages/{message_id}",
        json={"content": "hacked"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_delete_message_own(auth_client):
    client, _ = auth_client
    ch = await client.post("/api/v1/channels", json={"name": "del-ch"})
    channel_id = ch.json()["id"]
    msg = await client.post(f"/api/v1/channels/{channel_id}/messages", json={"content": "goodbye"})
    message_id = msg.json()["id"]
    response = await client.delete(f"/api/v1/channels/messages/{message_id}")
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_message_other_user(auth_client, second_auth_client):
    client, _ = auth_client
    client2, _ = second_auth_client
    ch = await client.post("/api/v1/channels", json={"name": "del-deny"})
    channel_id = ch.json()["id"]
    await client2.post(f"/api/v1/channels/{channel_id}/join")
    msg = await client.post(f"/api/v1/channels/{channel_id}/messages", json={"content": "mine"})
    message_id = msg.json()["id"]
    response = await client2.delete(f"/api/v1/channels/messages/{message_id}")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_non_member_send_rejected(auth_client, second_auth_client):
    client, _ = auth_client
    client2, _ = second_auth_client
    ch = await client.post("/api/v1/channels", json={"name": "private"})
    channel_id = ch.json()["id"]
    response = await client2.post(
        f"/api/v1/channels/{channel_id}/messages",
        json={"content": "intruder"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_non_member_read_rejected(auth_client, second_auth_client):
    client, _ = auth_client
    client2, _ = second_auth_client
    ch = await client.post("/api/v1/channels", json={"name": "private2"})
    channel_id = ch.json()["id"]
    response = await client2.get(f"/api/v1/channels/{channel_id}/messages")
    assert response.status_code == 403
