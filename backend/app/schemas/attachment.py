import uuid
from datetime import datetime
from pydantic import BaseModel


class AttachmentResponse(BaseModel):
    id: uuid.UUID
    message_id: uuid.UUID | None
    channel_id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int
    url: str
    thumbnail_url: str | None
    width: int | None
    height: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
