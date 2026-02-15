import uuid
from datetime import datetime, timedelta, timezone, date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func, delete, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_admin_user, get_superadmin_user
from app.redis_client import redis_client
from app.models.user import User
from app.models.channel import Channel
from app.models.membership import ChannelMember
from app.models.message import Message
from app.models.device import Device
from app.models.session import Session
from app.models.audit_log import AuditLog
from app.models.server_settings import ServerSettings
from app.models.analytics import AnalyticsDaily
from app.schemas.admin import (
    DashboardStats,
    AnalyticsResponse,
    AnalyticsDayPoint,
    AdminUserResponse,
    AdminUserDetail,
    AdminUserListResponse,
    BanRequest,
    SuspendRequest,
    PromoteRequest,
    AdminChannelResponse,
    AdminChannelDetail,
    AdminChannelListResponse,
    AuditLogResponse,
    AuditLogListResponse,
    ServerSettingResponse,
    ServerSettingUpdate,
    ServerSettingCreate,
)

router = APIRouter()


# ─── Helpers ───

async def log_action(
    db: AsyncSession,
    admin: User,
    action: str,
    target_type: str,
    target_id: str,
    details: dict | None = None,
    ip_address: str | None = None,
):
    entry = AuditLog(
        admin_user_id=admin.id,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        details=details,
        ip_address=ip_address,
    )
    db.add(entry)


def get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


# ─── Dashboard ───

@router.get("/dashboard/stats", response_model=DashboardStats)
async def dashboard_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    total_users = (await db.execute(select(func.count(User.id)).where(User.is_local == True))).scalar() or 0
    total_messages = (await db.execute(select(func.count(Message.id)))).scalar() or 0
    total_channels = (await db.execute(select(func.count(Channel.id)))).scalar() or 0

    # Active users = users with messages today
    active_users = (
        await db.execute(
            select(func.count(func.distinct(Message.sender_id))).where(Message.created_at >= today_start)
        )
    ).scalar() or 0

    return DashboardStats(
        total_users=total_users,
        active_users_today=active_users,
        total_messages=total_messages,
        total_channels=total_channels,
    )


@router.get("/dashboard/analytics", response_model=AnalyticsResponse)
async def dashboard_analytics(
    days: int = Query(30, ge=1, le=90),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    # Generate analytics from live data for the last N days
    today = date.today()
    result_days = []

    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        day_start = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)

        new_users = (
            await db.execute(
                select(func.count(User.id)).where(
                    User.is_local == True,
                    User.created_at >= day_start,
                    User.created_at < day_end,
                )
            )
        ).scalar() or 0

        active_users = (
            await db.execute(
                select(func.count(func.distinct(Message.sender_id))).where(
                    Message.created_at >= day_start,
                    Message.created_at < day_end,
                )
            )
        ).scalar() or 0

        new_messages = (
            await db.execute(
                select(func.count(Message.id)).where(
                    Message.created_at >= day_start,
                    Message.created_at < day_end,
                )
            )
        ).scalar() or 0

        new_channels = (
            await db.execute(
                select(func.count(Channel.id)).where(
                    Channel.created_at >= day_start,
                    Channel.created_at < day_end,
                )
            )
        ).scalar() or 0

        result_days.append(
            AnalyticsDayPoint(
                date=d,
                new_users=new_users,
                active_users=active_users,
                new_messages=new_messages,
                new_channels=new_channels,
            )
        )

    return AnalyticsResponse(days=result_days)


# ─── Users ───

@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str | None = None,
    role: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).where(User.is_local == True)
    count_query = select(func.count(User.id)).where(User.is_local == True)

    if search:
        query = query.where(User.username.ilike(f"%{search}%"))
        count_query = count_query.where(User.username.ilike(f"%{search}%"))
    if role:
        query = query.where(User.role == role)
        count_query = count_query.where(User.role == role)
    if status_filter == "banned":
        query = query.where(User.is_banned == True)
        count_query = count_query.where(User.is_banned == True)
    elif status_filter == "suspended":
        query = query.where(User.is_suspended == True)
        count_query = count_query.where(User.is_suspended == True)
    elif status_filter == "active":
        query = query.where(User.is_banned == False, User.is_suspended == False)
        count_query = count_query.where(User.is_banned == False, User.is_suspended == False)

    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(User.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    return AdminUserListResponse(
        users=[AdminUserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    device_count = (await db.execute(select(func.count(Device.id)).where(Device.user_id == user_id))).scalar() or 0
    session_count = (await db.execute(select(func.count(Session.id)).where(Session.user_id == user_id))).scalar() or 0
    channel_count = (
        await db.execute(select(func.count(ChannelMember.channel_id)).where(ChannelMember.user_id == user_id))
    ).scalar() or 0
    message_count = (await db.execute(select(func.count(Message.id)).where(Message.sender_id == user_id))).scalar() or 0

    data = AdminUserResponse.model_validate(target).model_dump()
    data.update(
        device_count=device_count,
        session_count=session_count,
        channel_count=channel_count,
        message_count=message_count,
    )
    return AdminUserDetail(**data)


@router.post("/users/{user_id}/ban", response_model=AdminUserResponse)
async def ban_user(
    user_id: uuid.UUID,
    body: BanRequest,
    request: Request,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot ban yourself")
    if target.role in ("admin", "superadmin") and admin.role != "superadmin":
        raise HTTPException(status_code=403, detail="Only superadmins can ban admins")

    target.is_banned = True
    target.ban_reason = body.reason

    # Invalidate all sessions
    await db.execute(delete(Session).where(Session.user_id == user_id))

    await log_action(db, admin, "ban_user", "user", str(user_id), {"reason": body.reason}, get_client_ip(request))

    return AdminUserResponse.model_validate(target)


@router.post("/users/{user_id}/unban", response_model=AdminUserResponse)
async def unban_user(
    user_id: uuid.UUID,
    request: Request,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.is_banned = False
    target.ban_reason = None

    await log_action(db, admin, "unban_user", "user", str(user_id), None, get_client_ip(request))

    return AdminUserResponse.model_validate(target)


@router.post("/users/{user_id}/suspend", response_model=AdminUserResponse)
async def suspend_user(
    user_id: uuid.UUID,
    body: SuspendRequest,
    request: Request,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot suspend yourself")
    if target.role in ("admin", "superadmin") and admin.role != "superadmin":
        raise HTTPException(status_code=403, detail="Only superadmins can suspend admins")

    target.is_suspended = True
    target.suspended_until = datetime.now(timezone.utc) + timedelta(hours=body.hours)

    await log_action(
        db, admin, "suspend_user", "user", str(user_id),
        {"hours": body.hours, "reason": body.reason}, get_client_ip(request),
    )

    return AdminUserResponse.model_validate(target)


@router.post("/users/{user_id}/unsuspend", response_model=AdminUserResponse)
async def unsuspend_user(
    user_id: uuid.UUID,
    request: Request,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.is_suspended = False
    target.suspended_until = None

    await log_action(db, admin, "unsuspend_user", "user", str(user_id), None, get_client_ip(request))

    return AdminUserResponse.model_validate(target)


@router.post("/users/{user_id}/promote", response_model=AdminUserResponse)
async def promote_user(
    user_id: uuid.UUID,
    body: PromoteRequest,
    request: Request,
    admin: User = Depends(get_superadmin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    old_role = target.role
    target.role = body.role

    await log_action(
        db, admin, "promote_user", "user", str(user_id),
        {"old_role": old_role, "new_role": body.role}, get_client_ip(request),
    )

    return AdminUserResponse.model_validate(target)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    request: Request,
    admin: User = Depends(get_superadmin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    if target.role == "superadmin":
        raise HTTPException(status_code=403, detail="Cannot delete a superadmin")

    username = target.username
    await log_action(
        db, admin, "delete_user", "user", str(user_id),
        {"username": username}, get_client_ip(request),
    )

    await db.delete(target)


# ─── Channels ───

@router.get("/channels", response_model=AdminChannelListResponse)
async def list_channels(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str | None = None,
    channel_type: str | None = Query(None, alias="type"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Channel)
    count_query = select(func.count(Channel.id))

    if search:
        query = query.where(Channel.name.ilike(f"%{search}%"))
        count_query = count_query.where(Channel.name.ilike(f"%{search}%"))
    if channel_type == "dm":
        query = query.where(Channel.is_dm == True)
        count_query = count_query.where(Channel.is_dm == True)
    elif channel_type == "channel":
        query = query.where(Channel.is_dm == False)
        count_query = count_query.where(Channel.is_dm == False)

    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(Channel.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    channels = result.scalars().all()

    # Get member and message counts
    channel_responses = []
    for ch in channels:
        member_count = (
            await db.execute(select(func.count(ChannelMember.user_id)).where(ChannelMember.channel_id == ch.id))
        ).scalar() or 0
        message_count = (
            await db.execute(select(func.count(Message.id)).where(Message.channel_id == ch.id))
        ).scalar() or 0

        data = AdminChannelResponse.model_validate(ch).model_dump()
        data["member_count"] = member_count
        data["message_count"] = message_count
        channel_responses.append(AdminChannelResponse(**data))

    return AdminChannelListResponse(
        channels=channel_responses,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/channels/{channel_id}", response_model=AdminChannelDetail)
async def get_channel_detail(
    channel_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    member_count = (
        await db.execute(select(func.count(ChannelMember.user_id)).where(ChannelMember.channel_id == channel_id))
    ).scalar() or 0
    message_count = (
        await db.execute(select(func.count(Message.id)).where(Message.channel_id == channel_id))
    ).scalar() or 0

    # Get member list with usernames
    members_result = await db.execute(
        select(ChannelMember.user_id, ChannelMember.role, User.username)
        .join(User, User.id == ChannelMember.user_id)
        .where(ChannelMember.channel_id == channel_id)
    )
    members = [{"user_id": str(r[0]), "role": r[1], "username": r[2]} for r in members_result.all()]

    data = AdminChannelResponse.model_validate(channel).model_dump()
    data["member_count"] = member_count
    data["message_count"] = message_count
    data["members"] = members
    return AdminChannelDetail(**data)


@router.delete("/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel(
    channel_id: uuid.UUID,
    request: Request,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    channel_name = channel.name

    await log_action(
        db, admin, "delete_channel", "channel", str(channel_id),
        {"name": channel_name}, get_client_ip(request),
    )

    # Delete messages and members first (cascade should handle, but be explicit)
    await db.execute(delete(Message).where(Message.channel_id == channel_id))
    await db.execute(delete(ChannelMember).where(ChannelMember.channel_id == channel_id))
    await db.delete(channel)


# ─── Audit Logs ───

@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    action: str | None = None,
    admin_id: uuid.UUID | None = None,
    target_type: str | None = None,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))

    if action:
        query = query.where(AuditLog.action == action)
        count_query = count_query.where(AuditLog.action == action)
    if admin_id:
        query = query.where(AuditLog.admin_user_id == admin_id)
        count_query = count_query.where(AuditLog.admin_user_id == admin_id)
    if target_type:
        query = query.where(AuditLog.target_type == target_type)
        count_query = count_query.where(AuditLog.target_type == target_type)

    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(AuditLog.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    logs = result.scalars().all()

    # Resolve admin usernames
    admin_ids = {log.admin_user_id for log in logs}
    admin_names: dict[uuid.UUID, str] = {}
    if admin_ids:
        users_result = await db.execute(select(User.id, User.username).where(User.id.in_(admin_ids)))
        admin_names = {r[0]: r[1] for r in users_result.all()}

    log_responses = []
    for log in logs:
        data = AuditLogResponse.model_validate(log).model_dump()
        data["admin_username"] = admin_names.get(log.admin_user_id)
        log_responses.append(AuditLogResponse(**data))

    return AuditLogListResponse(
        logs=log_responses,
        total=total,
        page=page,
        page_size=page_size,
    )


# ─── Settings ───

@router.get("/settings", response_model=list[ServerSettingResponse])
async def list_settings(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ServerSettings).order_by(ServerSettings.category, ServerSettings.key))
    settings = result.scalars().all()
    return [ServerSettingResponse.model_validate(s) for s in settings]


@router.get("/settings/{key}", response_model=ServerSettingResponse)
async def get_setting(
    key: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ServerSettings).where(ServerSettings.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return ServerSettingResponse.model_validate(setting)


@router.put("/settings/{key}", response_model=ServerSettingResponse)
async def update_setting(
    key: str,
    body: ServerSettingUpdate,
    request: Request,
    admin: User = Depends(get_superadmin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ServerSettings).where(ServerSettings.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")

    old_value = setting.value
    setting.value = body.value
    if body.description is not None:
        setting.description = body.description
    setting.updated_by = admin.id

    await log_action(
        db, admin, "update_setting", "setting", key,
        {"old_value": old_value, "new_value": body.value}, get_client_ip(request),
    )

    # Invalidate public config cache so changes take effect immediately
    try:
        await redis_client.delete("public_config")
    except Exception:
        pass

    return ServerSettingResponse.model_validate(setting)


@router.post("/settings", response_model=ServerSettingResponse, status_code=status.HTTP_201_CREATED)
async def create_setting(
    body: ServerSettingCreate,
    request: Request,
    admin: User = Depends(get_superadmin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ServerSettings).where(ServerSettings.key == body.key))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Setting already exists")

    setting = ServerSettings(
        key=body.key,
        value=body.value,
        category=body.category,
        description=body.description,
        updated_by=admin.id,
    )
    db.add(setting)
    await db.flush()

    await log_action(
        db, admin, "create_setting", "setting", body.key,
        {"value": body.value}, get_client_ip(request),
    )

    return ServerSettingResponse.model_validate(setting)
