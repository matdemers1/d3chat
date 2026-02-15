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
    display_name: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    status_message: str | None = None
    email_visible: bool = False
    preferences: dict = {}
    created_at: datetime

    model_config = {"from_attributes": True}


class PublicUserProfile(BaseModel):
    id: uuid.UUID
    username: str
    email: str | None = None
    server_domain: str
    is_local: bool
    role: str = "user"
    display_name: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    status_message: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    email: str | None = None
    username: str | None = Field(None, min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    display_name: str | None = Field(None, max_length=64)
    bio: str | None = Field(None, max_length=256)
    status_message: str | None = Field(None, max_length=128)
    email_visible: bool | None = None
    preferences: dict | None = None


class PasswordChange(BaseModel):
    old_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)
