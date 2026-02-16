import uuid
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(min_length=8, max_length=128)
    email: str | None = None
    display_name: str | None = Field(default=None, max_length=64)
    device_name: str = Field(default="default", max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str
    device_name: str = Field(default="default", max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: uuid.UUID
    device_id: uuid.UUID


class RefreshRequest(BaseModel):
    refresh_token: str


class WsTicketResponse(BaseModel):
    ticket: str
