import uuid
from datetime import datetime
from pydantic import BaseModel


class MessageCreate(BaseModel):
    content: str
    content_type: str = "text"
    protocol_version: int = 1
    sender_device_id: uuid.UUID | None = None


class MessageUpdate(BaseModel):
    content: str


class MessageResponse(BaseModel):
    id: uuid.UUID
    channel_id: uuid.UUID
    sender_id: uuid.UUID | None
    sender_device_id: uuid.UUID | None
    content: str
    content_type: str
    protocol_version: int
    edited_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MessagePage(BaseModel):
    messages: list[MessageResponse]
    has_more: bool
