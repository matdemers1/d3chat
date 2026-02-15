import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    email: str | None = None
    server_domain: str
    is_local: bool
    role: str = "user"
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    email: str | None = None
    username: str | None = Field(None, min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
