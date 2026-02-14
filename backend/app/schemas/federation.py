import uuid
from datetime import datetime

from pydantic import BaseModel


class FederationEventBase(BaseModel):
    event_id: str
    origin_server: str
    timestamp: datetime
    type: str


class MessageRelayEvent(FederationEventBase):
    type: str = "message.relay"
    channel_id: uuid.UUID
    sender_username: str
    sender_device_id: str | None = None
    content: str
    content_type: str = "text"
    protocol_version: int = 1
    origin_message_id: str


class SenderKeyDistributeEvent(FederationEventBase):
    type: str = "sender_key.distribute"
    channel_id: uuid.UUID
    device_id: str
    sender_username: str
    sender_key_public: str
    chain_key: str


class ChannelInviteEvent(FederationEventBase):
    type: str = "channel.invite"
    channel_id: uuid.UUID
    channel_name: str | None = None
    inviter_username: str
    invitee_username: str
    encryption_type: str = "sender_keys"


class ChannelJoinEvent(FederationEventBase):
    type: str = "channel.join"
    channel_id: uuid.UUID
    username: str


class ChannelLeaveEvent(FederationEventBase):
    type: str = "channel.leave"
    channel_id: uuid.UUID
    username: str


class WellKnownResponse(BaseModel):
    domain: str
    signing_key_public: str
    api_base_url: str
    protocol_version: int


class UserLookupResponse(BaseModel):
    found: bool
    username: str | None = None
    user_id: uuid.UUID | None = None
    server_domain: str | None = None
