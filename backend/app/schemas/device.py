import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class DeviceCreate(BaseModel):
    device_name: str = Field(max_length=128)
    device_key_public: str | None = None


class DeviceResponse(BaseModel):
    id: uuid.UUID
    device_name: str
    device_key_public: str | None = None
    last_seen_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
