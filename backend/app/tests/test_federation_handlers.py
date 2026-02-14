import uuid

import pytest
from httpx import AsyncClient


async def _register_and_auth(client: AsyncClient, username: str):
    """Helper: register a user and return (auth_headers, user_data)."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": "testpass123", "device_name": "dev"},
    )
    data = resp.json()
    return {"Authorization": f"Bearer {data['access_token']}"}, data


@pytest.mark.asyncio
async def test_handle_message_relay(client: AsyncClient):
    """message.relay: creates remote user and inserts message into channel."""
    from app.federation.handlers import dispatch_event
    from app.database import get_session_factory

    # Set up: create user and channel
    headers, user_data = await _register_and_auth(client, "localuser")
    ch = await client.post("/api/v1/channels", json={"name": "fed-ch"}, headers=headers)
    channel_id = ch.json()["id"]

    factory = get_session_factory()
    async with factory() as session:
        # First create remote user as member (prerequisite for relay)
        from app.federation.handlers import get_or_create_remote_user
        from app.models.membership import ChannelMember

        remote_user = await get_or_create_remote_user("alice", "remote.test", session)
        session.add(ChannelMember(channel_id=uuid.UUID(channel_id), user_id=remote_user.id, role="member"))
        await session.commit()

        # Now dispatch the relay event
        event = {
            "type": "message.relay",
            "origin_server": "remote.test",
            "sender_username": "alice",
            "channel_id": channel_id,
            "content": "Hello from remote!",
            "content_type": "text",
            "protocol_version": 1,
        }
        await dispatch_event("message.relay", event, session)
        await session.commit()

    # Verify message exists
    msgs = await client.get(f"/api/v1/channels/{channel_id}/messages", headers=headers)
    assert msgs.status_code == 200
    messages = msgs.json()["messages"]
    assert len(messages) == 1
    assert messages[0]["content"] == "Hello from remote!"


@pytest.mark.asyncio
async def test_handle_channel_invite(client: AsyncClient):
    """channel.invite: creates channel + membership for local invitee."""
    headers, user_data = await _register_and_auth(client, "invitee")

    channel_id = str(uuid.uuid4())

    from app.database import get_session_factory
    factory = get_session_factory()
    async with factory() as session:
        from app.federation.handlers import dispatch_event

        event = {
            "type": "channel.invite",
            "origin_server": "origin.test",
            "channel_id": channel_id,
            "invitee_username": "invitee",
            "inviter_username": "bob",
            "channel_name": "remote-general",
            "encryption_type": "sender_keys",
        }
        await dispatch_event("channel.invite", event, session)
        await session.commit()

    # Invitee should see the channel
    channels = await client.get("/api/v1/channels", headers=headers)
    assert channels.status_code == 200
    ch_ids = [c["id"] for c in channels.json()]
    assert channel_id in ch_ids


@pytest.mark.asyncio
async def test_handle_channel_join(client: AsyncClient):
    """channel.join: adds remote user membership to existing channel."""
    headers, _ = await _register_and_auth(client, "chowner")
    ch = await client.post("/api/v1/channels", json={"name": "join-ch"}, headers=headers)
    channel_id = ch.json()["id"]

    from app.database import get_session_factory
    factory = get_session_factory()
    async with factory() as session:
        from app.federation.handlers import dispatch_event

        event = {
            "type": "channel.join",
            "origin_server": "remote.test",
            "channel_id": channel_id,
            "username": "remote_joiner",
        }
        await dispatch_event("channel.join", event, session)
        await session.commit()

    # Verify member list includes remote user
    members = await client.get(f"/api/v1/channels/{channel_id}/members", headers=headers)
    assert members.status_code == 200
    usernames = [m["username"] for m in members.json()]
    assert "remote_joiner" in usernames


@pytest.mark.asyncio
async def test_handle_channel_leave(client: AsyncClient):
    """channel.leave: removes remote user membership."""
    headers, _ = await _register_and_auth(client, "chowner2")
    ch = await client.post("/api/v1/channels", json={"name": "leave-ch"}, headers=headers)
    channel_id = ch.json()["id"]

    from app.database import get_session_factory
    factory = get_session_factory()
    async with factory() as session:
        from app.federation.handlers import dispatch_event, get_or_create_remote_user
        from app.models.membership import ChannelMember

        # First join
        remote_user = await get_or_create_remote_user("leaver", "remote.test", session)
        session.add(ChannelMember(channel_id=uuid.UUID(channel_id), user_id=remote_user.id, role="member"))
        await session.commit()

        # Then leave
        event = {
            "type": "channel.leave",
            "origin_server": "remote.test",
            "channel_id": channel_id,
            "username": "leaver",
        }
        await dispatch_event("channel.leave", event, session)
        await session.commit()

    # Verify leaver is no longer a member
    members = await client.get(f"/api/v1/channels/{channel_id}/members", headers=headers)
    usernames = [m["username"] for m in members.json()]
    assert "leaver" not in usernames


@pytest.mark.asyncio
async def test_handle_sender_key_distribute(client: AsyncClient):
    """sender_key.distribute: stores remote sender key."""
    headers, user_data = await _register_and_auth(client, "skowner")
    ch = await client.post("/api/v1/channels", json={"name": "sk-fed"}, headers=headers)
    channel_id = ch.json()["id"]

    device_id = str(uuid.uuid4())

    from app.database import get_session_factory
    factory = get_session_factory()
    async with factory() as session:
        from app.federation.handlers import dispatch_event

        event = {
            "type": "sender_key.distribute",
            "origin_server": "remote.test",
            "channel_id": channel_id,
            "device_id": device_id,
            "sender_username": "remote_sender",
            "sender_key_public": "remote-sk-pub",
            "chain_key": "remote-ck",
        }
        await dispatch_event("sender_key.distribute", event, session)
        await session.commit()

    # Verify sender key can be fetched
    keys = await client.get(f"/api/v1/keys/channels/{channel_id}/sender-keys", headers=headers)
    assert keys.status_code == 200
    sk_list = keys.json()
    assert any(k["sender_key_public"] == "remote-sk-pub" for k in sk_list)
