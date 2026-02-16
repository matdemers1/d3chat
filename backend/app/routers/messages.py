import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.channel import Channel
from app.models.membership import ChannelMember
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.user import User
from app.schemas.message import AttachmentSnippet, MessageCreate, MessagePage, MessageResponse, MessageUpdate
from app.redis_client import get_redis
from app.federation.relay import relay_message_to_remote_servers

logger = logging.getLogger("d3chat.messages")

router = APIRouter()


def _attachment_to_snippet(att: Attachment) -> dict:
    return {
        "id": str(att.id),
        "filename": att.filename,
        "content_type": att.content_type,
        "size_bytes": att.size_bytes,
        "url": f"/api/v1/attachments/{att.id}/download",
        "thumbnail_url": f"/api/v1/attachments/{att.id}/thumbnail" if att.thumbnail_path else None,
        "width": att.width,
        "height": att.height,
    }


@router.get("/{channel_id}/messages", response_model=MessagePage)
async def get_messages(
    channel_id: uuid.UUID,
    before: datetime | None = None,
    limit: int = Query(default=50, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(channel_id, user.id, db)

    query = (
        select(Message)
        .where(Message.channel_id == channel_id)
        .options(selectinload(Message.reply_to), selectinload(Message.attachments))
    )
    if before:
        query = query.where(Message.created_at < before)
    query = query.order_by(Message.created_at.desc()).limit(limit + 1)

    result = await db.execute(query)
    messages = list(result.scalars().all())

    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]

    messages.reverse()
    return MessagePage(messages=messages, has_more=has_more)


@router.post("/{channel_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    channel_id: uuid.UUID,
    body: MessageCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(channel_id, user.id, db)

    if body.reply_to_id:
        parent_result = await db.execute(
            select(Message).where(Message.id == body.reply_to_id)
        )
        parent_msg = parent_result.scalar_one_or_none()
        if not parent_msg or parent_msg.channel_id != channel_id:
            raise HTTPException(status_code=400, detail="reply_to_id must reference a message in the same channel")

    message = Message(
        channel_id=channel_id,
        sender_id=user.id,
        sender_device_id=body.sender_device_id,
        content=body.content,
        content_type=body.content_type,
        protocol_version=body.protocol_version,
        reply_to_id=body.reply_to_id,
    )
    db.add(message)
    await db.flush()

    # Link attachments to the message
    attachment_snippets = []
    if body.attachment_ids:
        att_result = await db.execute(
            select(Attachment).where(
                Attachment.id.in_(body.attachment_ids),
                Attachment.channel_id == channel_id,
                Attachment.message_id.is_(None),
            )
        )
        attachments = list(att_result.scalars().all())
        for att in attachments:
            att.message_id = message.id
            attachment_snippets.append(_attachment_to_snippet(att))

    logger.info(
        f"Message created: id={message.id}, channel={channel_id}, "
        f"sender={user.id}, protocol_version={body.protocol_version}, "
        f"sender_device_id={body.sender_device_id}, "
        f"content_len={len(body.content)}, attachments={len(attachment_snippets)}"
    )

    # Build reply_to snippet for the Redis payload
    reply_to_snippet = None
    if body.reply_to_id:
        # parent_msg was already loaded above during validation
        reply_to_snippet = {
            "id": str(parent_msg.id),
            "sender_id": str(parent_msg.sender_id) if parent_msg.sender_id else None,
            "content": parent_msg.content,
            "content_type": parent_msg.content_type,
            "protocol_version": parent_msg.protocol_version,
        }

    # Publish to Redis for WebSocket fan-out
    redis = await get_redis()
    import json
    logger.info(f"Publishing message.new to channel:{channel_id}")
    await redis.publish(
        f"channel:{channel_id}",
        json.dumps({
            "type": "message.new",
            "message": {
                "id": str(message.id),
                "channel_id": str(message.channel_id),
                "sender_id": str(message.sender_id),
                "sender_device_id": str(message.sender_device_id) if message.sender_device_id else None,
                "content": message.content,
                "content_type": message.content_type,
                "protocol_version": message.protocol_version,
                "reply_to_id": str(message.reply_to_id) if message.reply_to_id else None,
                "reply_to": reply_to_snippet,
                "attachments": attachment_snippets,
                "edited_at": None,
                "created_at": message.created_at.isoformat(),
            },
        }),
    )

    # Relay to remote servers if channel is federated
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if channel and channel.is_federated:
        await relay_message_to_remote_servers(channel_id, message, user, db)

    await db.refresh(message, ["reply_to", "attachments"])
    return message


@router.patch("/messages/{message_id}", response_model=MessageResponse)
async def edit_message(
    message_id: uuid.UUID,
    body: MessageUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.sender_id != user.id:
        raise HTTPException(status_code=403, detail="Can only edit own messages")

    message.content = body.content
    message.edited_at = datetime.now(timezone.utc)
    db.add(message)

    redis = await get_redis()
    import json
    await redis.publish(
        f"channel:{message.channel_id}",
        json.dumps({
            "type": "message.edit",
            "message": {
                "id": str(message.id),
                "channel_id": str(message.channel_id),
                "content": message.content,
                "edited_at": message.edited_at.isoformat(),
            },
        }),
    )

    return message


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.sender_id != user.id:
        raise HTTPException(status_code=403, detail="Can only delete own messages")

    channel_id = message.channel_id
    msg_id = str(message.id)
    await db.delete(message)

    redis = await get_redis()
    import json
    await redis.publish(
        f"channel:{channel_id}",
        json.dumps({"type": "message.delete", "message_id": msg_id, "channel_id": str(channel_id)}),
    )


async def _check_membership(channel_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession):
    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this channel")
