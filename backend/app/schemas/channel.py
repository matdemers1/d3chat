import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class ChannelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    is_dm: bool = False
    encryption_type: str = "sender_keys"


class ChannelUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)


class ChannelResponse(BaseModel):
    id: uuid.UUID
    name: str | None
    is_dm: bool
    is_federated: bool
    encryption_type: str
    created_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChannelMemberResponse(BaseModel):
    user_id: uuid.UUID
    username: str
    server_domain: str
    is_local: bool
    role: str
    joined_at: datetime


class DMCreate(BaseModel):
    user_id: uuid.UUID


class AddMemberRequest(BaseModel):
    user_id: uuid.UUID
