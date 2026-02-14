import asyncio
import json
import logging
from uuid import UUID

from fastapi import WebSocket
import redis.asyncio as aioredis

from app.redis_client import redis_client

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # user_id -> set of WebSocket connections
        self._connections: dict[UUID, set[WebSocket]] = {}
        # channel_id -> set of user_ids subscribed on this instance
        self._channel_users: dict[UUID, set[UUID]] = {}
        self._pubsub: aioredis.client.PubSub | None = None
        self._listener_task: asyncio.Task | None = None
        # Track all subscribed Redis channel names for resubscription
        self._subscribed_channels: set[str] = set()

    def _listener_alive(self) -> bool:
        return (
            self._listener_task is not None
            and not self._listener_task.done()
        )

    async def _ensure_pubsub(self):
        """Ensure pubsub and listener are alive. Recreate if dead."""
        if self._pubsub and self._listener_alive():
            return

        if self._pubsub:
            logger.warning("Pub/sub listener is dead, recreating...")
            try:
                await self._pubsub.close()
            except Exception:
                pass
            self._pubsub = None
            self._listener_task = None

        self._pubsub = redis_client.pubsub()
        logger.info("Created new pub/sub connection")

        # Resubscribe to all previously tracked channels BEFORE starting listener.
        # listen() checks `self.subscribed` which is only True after subscribe() completes.
        channels_to_sub = list(self._subscribed_channels)
        if channels_to_sub:
            logger.info(f"Resubscribing to {len(channels_to_sub)} channel(s): {channels_to_sub}")
            for ch in channels_to_sub:
                await self._pubsub.subscribe(ch)

    async def _ensure_listener(self):
        """Start the listener task if pubsub has subscriptions but listener isn't running."""
        if self._pubsub and not self._listener_alive():
            self._listener_task = asyncio.create_task(self._listen())
            logger.info("Started pub/sub listener task")

    async def connect(self, websocket: WebSocket, user_id: UUID):
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)

        # Set presence
        await redis_client.setex(f"presence:{user_id}", 300, "online")

        # Subscribe to personal user channel for direct notifications
        await self._subscribe_user_channel(user_id)

    async def disconnect(self, websocket: WebSocket, user_id: UUID):
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]
                await redis_client.delete(f"presence:{user_id}")

                # Unsubscribe from user channel
                user_ch = f"user:{user_id}"
                self._subscribed_channels.discard(user_ch)
                if self._pubsub:
                    try:
                        await self._pubsub.unsubscribe(user_ch)
                    except Exception:
                        pass

                # Unsubscribe from channels with no local users
                for channel_id in list(self._channel_users.keys()):
                    self._channel_users.get(channel_id, set()).discard(user_id)
                    if not self._channel_users.get(channel_id):
                        self._channel_users.pop(channel_id, None)
                        ch_name = f"channel:{channel_id}"
                        self._subscribed_channels.discard(ch_name)
                        if self._pubsub:
                            try:
                                await self._pubsub.unsubscribe(ch_name)
                            except Exception:
                                pass

    async def subscribe_to_channel(self, channel_id: UUID, user_id: UUID):
        logger.info(f"subscribe_to_channel: channel={channel_id}, user={user_id}, already_subscribed={channel_id in self._channel_users}")
        if channel_id not in self._channel_users:
            self._channel_users[channel_id] = set()
            await self._ensure_pubsub()
            ch_name = f"channel:{channel_id}"
            self._subscribed_channels.add(ch_name)
            await self._pubsub.subscribe(ch_name)
            # Start listener AFTER subscribe so pubsub.subscribed is True
            await self._ensure_listener()
            logger.info(f"  -> Redis subscribed to {ch_name}")
        self._channel_users[channel_id].add(user_id)
        logger.info(f"  -> channel_users[{channel_id}] = {[str(u) for u in self._channel_users[channel_id]]}")

    async def _subscribe_user_channel(self, user_id: UUID):
        """Subscribe to user:{user_id} Redis channel for direct notifications."""
        logger.info(f"Subscribing to user channel: user:{user_id}")
        await self._ensure_pubsub()
        ch_name = f"user:{user_id}"
        self._subscribed_channels.add(ch_name)
        await self._pubsub.subscribe(ch_name)
        # Start listener AFTER subscribe so pubsub.subscribed is True
        await self._ensure_listener()

    async def send_to_user(self, user_id: UUID, data: dict):
        connections = self._connections.get(user_id, set())
        dead = []
        for ws in connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            connections.discard(ws)

    async def _listen(self):
        logger.info("Pub/sub listener STARTED")
        try:
            async for message in self._pubsub.listen():
                msg_type = message.get("type")
                channel_str = message.get("channel", "")
                if msg_type == "subscribe":
                    logger.info(f"Pub/sub confirmed subscription: {channel_str!r}")
                    continue
                if msg_type == "unsubscribe":
                    logger.info(f"Pub/sub confirmed unsubscription: {channel_str!r}")
                    continue
                if msg_type != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                    logger.info(f"Pub/sub recv on '{channel_str}': type={data.get('type')}")
                    if isinstance(channel_str, str) and channel_str.startswith("channel:"):
                        channel_id = UUID(channel_str.split(":", 1)[1])
                        user_ids = self._channel_users.get(channel_id, set())
                        logger.info(f"  -> forwarding to {len(user_ids)} user(s): {[str(u) for u in user_ids]}")
                        for user_id in user_ids:
                            await self.send_to_user(user_id, data)
                    elif isinstance(channel_str, str) and channel_str.startswith("user:"):
                        user_id = UUID(channel_str.split(":", 1)[1])
                        has_conn = user_id in self._connections
                        logger.info(f"  -> forwarding to user {user_id} (connected={has_conn})")
                        await self.send_to_user(user_id, data)
                    else:
                        logger.warning(f"  -> unknown channel prefix: {channel_str!r}")
                except Exception as e:
                    logger.error(f"Error processing pub/sub message: {e}", exc_info=True)
        except asyncio.CancelledError:
            logger.info("Pub/sub listener cancelled")
        except Exception as e:
            logger.error(f"Pub/sub listener DIED: {e}", exc_info=True)
        finally:
            logger.warning("Pub/sub listener exited")


manager = ConnectionManager()
