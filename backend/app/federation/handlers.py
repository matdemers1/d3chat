import json
import logging
import uuid

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.channel import Channel
from app.models.membership import ChannelMember
from app.models.message import Message
from app.models.sender_key import SenderKey
from app.models.user import User
from app.redis_client import redis_client

logger = logging.getLogger("d3chat.federation.handlers")


async def dispatch_event(event_type: str, event_data: dict, db: AsyncSession) -> None:
    """Route a federation event to the appropriate handler."""
    handlers = {
        "message.relay": handle_message_relay,
        "channel.invite": handle_channel_invite,
        "channel.join": handle_channel_join,
        "channel.leave": handle_channel_leave,
        "sender_key.distribute": handle_sender_key_distribute,
    }
    handler = handlers.get(event_type)
    if not handler:
        logger.warning("Unknown federation event type: %s", event_type)
        return
    await handler(event_data, db)


async def get_or_create_remote_user(username: str, server_domain: str, db: AsyncSession) -> User:
    """Get or create a remote (non-local) user record."""
    result = await db.execute(
        select(User).where(
            User.username == username,
            User.server_domain == server_domain,
        )
    )
    user = result.scalar_one_or_none()
    if user:
        return user

    user = User(
        username=username,
        server_domain=server_domain,
        is_local=False,
        password_hash=None,
    )
    db.add(user)
    await db.flush()
    logger.info("Created remote user: %s@%s (id=%s)", username, server_domain, user.id)
    return user


async def handle_message_relay(event_data: dict, db: AsyncSession) -> None:
    """Handle an inbound relayed message from a remote server."""
    origin_server = event_data["origin_server"]
    sender_username = event_data["sender_username"]
    channel_id = uuid.UUID(event_data["channel_id"])

    # Get or create the remote sender
    sender = await get_or_create_remote_user(sender_username, origin_server, db)

    # Verify channel exists locally
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        logger.warning("Message relay for unknown channel: %s", channel_id)
        return

    # Verify membership
    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == sender.id,
        )
    )
    if not result.scalar_one_or_none():
        logger.warning("Remote user %s not a member of channel %s", sender.id, channel_id)
        return

    # Insert message
    message = Message(
        channel_id=channel_id,
        sender_id=sender.id,
        content=event_data["content"],
        content_type=event_data.get("content_type", "text"),
        protocol_version=event_data.get("protocol_version", 1),
        origin_server=origin_server,
        origin_message_id=event_data.get("origin_message_id"),
    )
    db.add(message)
    await db.flush()

    # Publish to Redis for local WS delivery
    await redis_client.publish(
        f"channel:{channel_id}",
        json.dumps({
            "type": "message.new",
            "message": {
                "id": str(message.id),
                "channel_id": str(message.channel_id),
                "sender_id": str(message.sender_id),
                "sender_device_id": None,
                "content": message.content,
                "content_type": message.content_type,
                "protocol_version": message.protocol_version,
                "edited_at": None,
                "created_at": message.created_at.isoformat() if message.created_at else None,
            },
        }),
    )
    logger.info("Relayed message %s from %s@%s to channel %s", message.id, sender_username, origin_server, channel_id)


async def handle_channel_invite(event_data: dict, db: AsyncSession) -> None:
    """Handle a channel invite from a remote server."""
    origin_server = event_data["origin_server"]
    channel_id = uuid.UUID(event_data["channel_id"])
    invitee_username = event_data["invitee_username"]
    inviter_username = event_data["inviter_username"]
    channel_name = event_data.get("channel_name")
    encryption_type = event_data.get("encryption_type", "sender_keys")

    from app.config import get_settings
    settings = get_settings()

    # Find the local invitee
    result = await db.execute(
        select(User).where(
            User.username == invitee_username,
            User.server_domain == settings.server_domain,
            User.is_local == True,
        )
    )
    invitee = result.scalar_one_or_none()
    if not invitee:
        logger.warning("Channel invite for unknown local user: %s", invitee_username)
        return

    # Get or create remote inviter user
    inviter = await get_or_create_remote_user(inviter_username, origin_server, db)

    # Create channel if not exists (use same UUID as origin)
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()

    if not channel:
        channel = Channel(
            id=channel_id,
            name=channel_name,
            is_dm=False,
            is_federated=True,
            encryption_type=encryption_type,
        )
        db.add(channel)
        await db.flush()

        # Add inviter as member too
        db.add(ChannelMember(channel_id=channel_id, user_id=inviter.id, role="member"))
    else:
        channel.is_federated = True

    # Add invitee as member
    existing = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == invitee.id,
        )
    )
    if not existing.scalar_one_or_none():
        db.add(ChannelMember(channel_id=channel_id, user_id=invitee.id, role="member"))

    await db.flush()

    # Publish channel.new to invitee's Redis channel
    await redis_client.publish(
        f"user:{invitee.id}",
        json.dumps({
            "type": "channel.new",
            "channel": {
                "id": str(channel.id),
                "name": channel.name,
                "is_dm": channel.is_dm,
                "is_federated": channel.is_federated,
                "encryption_type": channel.encryption_type,
                "created_by": str(channel.created_by) if channel.created_by else None,
                "created_at": channel.created_at.isoformat() if channel.created_at else None,
            },
        }),
    )
    logger.info(
        "Channel invite: %s@%s invited %s to channel %s",
        inviter_username, origin_server, invitee_username, channel_id,
    )


async def handle_channel_join(event_data: dict, db: AsyncSession) -> None:
    """Handle a remote user joining a federated channel."""
    origin_server = event_data["origin_server"]
    channel_id = uuid.UUID(event_data["channel_id"])
    username = event_data["username"]

    user = await get_or_create_remote_user(username, origin_server, db)

    # Verify channel exists
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        logger.warning("Channel join for unknown channel: %s", channel_id)
        return

    # Add membership if not exists
    existing = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == user.id,
        )
    )
    if not existing.scalar_one_or_none():
        db.add(ChannelMember(channel_id=channel_id, user_id=user.id, role="member"))
        logger.info("Remote user %s@%s joined channel %s", username, origin_server, channel_id)


async def handle_channel_leave(event_data: dict, db: AsyncSession) -> None:
    """Handle a remote user leaving a federated channel."""
    origin_server = event_data["origin_server"]
    channel_id = uuid.UUID(event_data["channel_id"])
    username = event_data["username"]

    result = await db.execute(
        select(User).where(
            User.username == username,
            User.server_domain == origin_server,
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        return

    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == user.id,
        )
    )
    member = result.scalar_one_or_none()
    if member:
        await db.delete(member)
        logger.info("Remote user %s@%s left channel %s", username, origin_server, channel_id)


async def handle_sender_key_distribute(event_data: dict, db: AsyncSession) -> None:
    """Handle a sender key distribution from a remote device."""
    origin_server = event_data["origin_server"]
    channel_id = uuid.UUID(event_data["channel_id"])
    device_id_str = event_data["device_id"]
    sender_username = event_data["sender_username"]
    sender_key_public = event_data["sender_key_public"]
    chain_key = event_data["chain_key"]

    # Parse device_id as UUID (remote device, no FK constraint after migration)
    device_id = uuid.UUID(device_id_str)

    # Verify channel exists
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    if not result.scalar_one_or_none():
        logger.warning("Sender key for unknown channel: %s", channel_id)
        return

    # Upsert sender key
    existing = await db.execute(
        select(SenderKey).where(
            and_(
                SenderKey.channel_id == channel_id,
                SenderKey.device_id == device_id,
            )
        )
    )
    sender_key = existing.scalar_one_or_none()

    if sender_key:
        sender_key.sender_key_public = sender_key_public
        sender_key.chain_key = chain_key
        sender_key.message_number = 0
    else:
        sender_key = SenderKey(
            channel_id=channel_id,
            device_id=device_id,
            sender_key_public=sender_key_public,
            chain_key=chain_key,
            message_number=0,
        )
        db.add(sender_key)

    await db.flush()

    # Publish sender_key.new to channel so local clients can fetch
    await redis_client.publish(
        f"channel:{channel_id}",
        json.dumps({
            "type": "sender_key.new",
            "channel_id": str(channel_id),
            "device_id": device_id_str,
            "sender_username": sender_username,
            "origin_server": origin_server,
        }),
    )
    logger.info(
        "Stored remote sender key: device=%s user=%s@%s channel=%s",
        device_id_str, sender_username, origin_server, channel_id,
    )
