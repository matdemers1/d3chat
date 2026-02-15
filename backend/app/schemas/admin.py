import uuid
from datetime import date, datetime
from pydantic import BaseModel, Field


# Dashboard
class DashboardStats(BaseModel):
    total_users: int
    active_users_today: int
    total_messages: int
    total_channels: int


class AnalyticsDayPoint(BaseModel):
    date: date
    new_users: int
    active_users: int
    new_messages: int
    new_channels: int


class AnalyticsResponse(BaseModel):
    days: list[AnalyticsDayPoint]


# Users
class AdminUserResponse(BaseModel):
    id: uuid.UUID
    username: str
    email: str | None = None
    server_domain: str
    is_local: bool
    role: str
    is_banned: bool
    is_suspended: bool
    suspended_until: datetime | None = None
    ban_reason: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminUserDetail(AdminUserResponse):
    device_count: int = 0
    session_count: int = 0
    channel_count: int = 0
    message_count: int = 0


class AdminUserListResponse(BaseModel):
    users: list[AdminUserResponse]
    total: int
    page: int
    page_size: int


class BanRequest(BaseModel):
    reason: str | None = None


class SuspendRequest(BaseModel):
    hours: int = Field(gt=0, le=8760, description="Suspension duration in hours (max 1 year)")
    reason: str | None = None


class PromoteRequest(BaseModel):
    role: str = Field(pattern=r"^(user|admin|superadmin)$")


# Channels
class AdminChannelResponse(BaseModel):
    id: uuid.UUID
    name: str | None = None
    is_dm: bool
    is_federated: bool
    encryption_type: str
    created_by: uuid.UUID | None = None
    created_at: datetime
    member_count: int = 0
    message_count: int = 0

    model_config = {"from_attributes": True}


class AdminChannelListResponse(BaseModel):
    channels: list[AdminChannelResponse]
    total: int
    page: int
    page_size: int


class AdminChannelDetail(AdminChannelResponse):
    members: list[dict] = []


# Audit Logs
class AuditLogResponse(BaseModel):
    id: uuid.UUID
    admin_user_id: uuid.UUID
    admin_username: str | None = None
    action: str
    target_type: str
    target_id: str
    details: dict | None = None
    ip_address: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    logs: list[AuditLogResponse]
    total: int
    page: int
    page_size: int


# Settings
class ServerSettingResponse(BaseModel):
    key: str
    value: dict | None = None
    category: str
    description: str | None = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class ServerSettingUpdate(BaseModel):
    value: dict | None = None
    description: str | None = None


class ServerSettingCreate(BaseModel):
    key: str = Field(min_length=1, max_length=128)
    value: dict | None = None
    category: str = Field(default="general", max_length=64)
    description: str | None = None


class PublicConfigResponse(BaseModel):
    app_name: str = "d3chat"
    app_description: str = "Federated end-to-end encrypted chat"
    registration_mode: str = "open"
    brand_primary_color: str = "#3b82f6"
    brand_accent_color: str = "#10b981"
