import json
import logging
import uuid
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session_factory
from app.models.membership import ChannelMember
from app.redis_client import redis_client
from app.websocket.manager import manager

logger = logging.getLogger("d3chat.ws")

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, ticket: str = Query()):
    # Authenticate via one-time ticket
    user_id_str = await redis_client.getdel(f"ws_ticket:{ticket}")
    if not user_id_str:
        logger.warning("WS connection rejected: invalid or expired ticket")
        await websocket.close(code=4001, reason="Invalid or expired ticket")
        return

    user_id = UUID(user_id_str)
    logger.info(f"WS connected: user={user_id}")
    await manager.connect(websocket, user_id)

    # Subscribe to all channels the user is a member of
    async with get_session_factory()() as db:
        result = await db.execute(
            select(ChannelMember.channel_id).where(ChannelMember.user_id == user_id)
        )
        channel_ids = result.scalars().all()
        logger.info(f"WS subscribing user={user_id} to {len(channel_ids)} channels: {[str(c) for c in channel_ids]}")
        for channel_id in channel_ids:
            await manager.subscribe_to_channel(channel_id, user_id)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON"})
                continue

            msg_type = data.get("type")
            logger.info(f"WS recv from user={user_id}: type={msg_type}")

            if msg_type == "typing.start" or msg_type == "typing.stop":
                channel_id = data.get("channel_id")
                if channel_id:
                    await redis_client.publish(
                        f"channel:{channel_id}",
                        json.dumps({
                            "type": msg_type,
                            "user_id": str(user_id),
                            "channel_id": channel_id,
                        }),
                    )

            elif msg_type == "presence.update":
                status = data.get("status", "online")
                if status in ("online", "away", "offline"):
                    if status == "offline":
                        await redis_client.delete(f"presence:{user_id}")
                    else:
                        await redis_client.setex(f"presence:{user_id}", 300, status)

            elif msg_type == "subscribe":
                channel_id_str = data.get("channel_id")
                if channel_id_str:
                    logger.info(f"WS subscribe: user={user_id} -> channel={channel_id_str}")
                    await manager.subscribe_to_channel(UUID(channel_id_str), user_id)

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: user={user_id}")
    finally:
        await manager.disconnect(websocket, user_id)
