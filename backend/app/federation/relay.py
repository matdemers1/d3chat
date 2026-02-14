import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.federation.client import send_federation_event
from app.models.channel import Channel
from app.models.membership import ChannelMember
from app.models.message import Message
from app.models.server import Server
from app.models.user import User

logger = logging.getLogger("d3chat.federation.relay")


async def _get_remote_server_urls(channel_id: uuid.UUID, db: AsyncSession) -> list[str]:
    """Find distinct remote server API base URLs for members of a channel."""
    settings = get_settings()

    # Get all remote users in this channel
    result = await db.execute(
        select(distinct(User.server_domain))
        .join(ChannelMember, ChannelMember.user_id == User.id)
        .where(
            ChannelMember.channel_id == channel_id,
            User.is_local == False,
        )
    )
    remote_domains = result.scalars().all()

    urls = []
    for domain in remote_domains:
        if domain == settings.server_domain:
            continue
        srv_result = await db.execute(select(Server).where(Server.domain == domain))
        server = srv_result.scalar_one_or_none()
        if server and server.api_base_url:
            urls.append(server.api_base_url)
        else:
            urls.append(f"http://{domain}")
    return urls


async def relay_message_to_remote_servers(
    channel_id: uuid.UUID,
    message: Message,
    sender: User,
    db: AsyncSession,
) -> None:
    """Relay a message to all remote servers that have members in the channel."""
    settings = get_settings()
    urls = await _get_remote_server_urls(channel_id, db)
    if not urls:
        return

    event = {
        "event_id": f"msg-{message.id}",
        "origin_server": settings.server_domain,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "message.relay",
        "channel_id": str(channel_id),
        "sender_username": sender.username,
        "sender_device_id": str(message.sender_device_id) if message.sender_device_id else None,
        "content": message.content,
        "content_type": message.content_type,
        "protocol_version": message.protocol_version,
        "origin_message_id": str(message.id),
    }

    for url in urls:
        await send_federation_event(url, event)


async def send_channel_invite(
    channel: Channel,
    target_user: User,
    inviter: User,
    db: AsyncSession,
) -> None:
    """Send a channel invite to a remote user's server."""
    settings = get_settings()

    # Discover target server
    from app.federation.discovery import discover_server
    server = await discover_server(target_user.server_domain, db)
    api_base_url = server.api_base_url or f"http://{target_user.server_domain}"

    event = {
        "event_id": f"invite-{channel.id}-{target_user.id}",
        "origin_server": settings.server_domain,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "channel.invite",
        "channel_id": str(channel.id),
        "channel_name": channel.name,
        "inviter_username": inviter.username,
        "invitee_username": target_user.username,
        "encryption_type": channel.encryption_type,
    }

    await send_federation_event(api_base_url, event)


async def relay_sender_key(
    channel_id: uuid.UUID,
    sender_key_data: dict,
    sender: User,
    db: AsyncSession,
) -> None:
    """Relay a sender key distribution to remote servers in a federated channel."""
    settings = get_settings()
    urls = await _get_remote_server_urls(channel_id, db)
    if not urls:
        return

    event = {
        "event_id": f"sk-{channel_id}-{sender_key_data['device_id']}",
        "origin_server": settings.server_domain,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "sender_key.distribute",
        "channel_id": str(channel_id),
        "device_id": str(sender_key_data["device_id"]),
        "sender_username": sender.username,
        "sender_key_public": sender_key_data["sender_key_public"],
        "chain_key": sender_key_data["chain_key"],
    }

    for url in urls:
        await send_federation_event(url, event)
