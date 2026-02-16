import uuid
from datetime import datetime
from pydantic import BaseModel, model_validator


class ReplySnippet(BaseModel):
    id: uuid.UUID
    sender_id: uuid.UUID | None
    content: str
    content_type: str
    protocol_version: int

    model_config = {"from_attributes": True}


class AttachmentSnippet(BaseModel):
    id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int
    url: str = ""
    thumbnail_url: str | None = None
    width: int | None = None
    height: int | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def compute_urls(cls, data):
        """Compute url/thumbnail_url from the ORM model's fields."""
        if hasattr(data, "id"):
            # ORM model object
            att_id = data.id
            has_thumb = getattr(data, "thumbnail_path", None)
            return {
                "id": att_id,
                "filename": data.filename,
                "content_type": data.content_type,
                "size_bytes": data.size_bytes,
                "url": f"/api/v1/attachments/{att_id}/download",
                "thumbnail_url": f"/api/v1/attachments/{att_id}/thumbnail" if has_thumb else None,
                "width": data.width,
                "height": data.height,
            }
        return data


class MessageCreate(BaseModel):
    content: str
    content_type: str = "text"
    protocol_version: int = 1
    sender_device_id: uuid.UUID | None = None
    reply_to_id: uuid.UUID | None = None
    attachment_ids: list[uuid.UUID] = []


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
    reply_to_id: uuid.UUID | None = None
    reply_to: ReplySnippet | None = None
    attachments: list[AttachmentSnippet] = []
    edited_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MessagePage(BaseModel):
    messages: list[MessageResponse]
    has_more: bool
