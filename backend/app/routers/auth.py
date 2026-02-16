import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.crypto.passwords import hash_password, verify_password
from app.crypto.tokens import create_access_token, create_refresh_token, hash_refresh_token
from app.database import get_db
from app.dependencies import get_current_user
from app.models.device import Device
from app.models.server_settings import ServerSettings
from app.models.session import Session
from app.models.user import User
from app.redis_client import get_redis
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    WsTicketResponse,
)

router = APIRouter()
settings = get_settings()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check registration mode
    reg_mode_result = await db.execute(
        select(ServerSettings).where(ServerSettings.key == "registration_mode")
    )
    reg_mode_setting = reg_mode_result.scalar_one_or_none()
    reg_mode = "open"
    if reg_mode_setting and reg_mode_setting.value and "value" in reg_mode_setting.value:
        reg_mode = reg_mode_setting.value["value"]

    if reg_mode == "closed":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registration is currently closed")
    if reg_mode == "invite_only":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registration is invite-only")

    # Check domain allowlist
    if body.email:
        allowlist_result = await db.execute(
            select(ServerSettings).where(ServerSettings.key == "registration_domain_allowlist")
        )
        allowlist_setting = allowlist_result.scalar_one_or_none()
        if allowlist_setting and allowlist_setting.value and "value" in allowlist_setting.value:
            allowed_domains = allowlist_setting.value["value"]
            if isinstance(allowed_domains, list) and len(allowed_domains) > 0:
                email_domain = body.email.rsplit("@", 1)[-1].lower()
                if email_domain not in [d.lower() for d in allowed_domains]:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Email domain '{email_domain}' is not allowed for registration",
                    )

    result = await db.execute(
        select(User).where(User.username == body.username, User.server_domain == settings.server_domain)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    user = User(
        username=body.username,
        email=body.email,
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        server_domain=settings.server_domain,
        is_local=True,
    )
    db.add(user)
    await db.flush()

    device = Device(user_id=user.id, device_name=body.device_name)
    db.add(device)
    await db.flush()

    refresh_token = create_refresh_token()
    session = Session(
        user_id=user.id,
        device_id=device.id,
        refresh_token_hash=hash_refresh_token(refresh_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(session)

    access_token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        device_id=device.id,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.username == body.username, User.server_domain == settings.server_domain)
    )
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Check ban/suspension
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account has been banned")
    if user.is_suspended:
        if user.suspended_until and user.suspended_until > datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account suspended until {user.suspended_until.isoformat()}",
            )
        else:
            # Auto-unsuspend if suspension expired
            user.is_suspended = False
            user.suspended_until = None

    device = Device(user_id=user.id, device_name=body.device_name)
    db.add(device)
    await db.flush()

    refresh_token = create_refresh_token()
    session = Session(
        user_id=user.id,
        device_id=device.id,
        refresh_token_hash=hash_refresh_token(refresh_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(session)

    access_token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        device_id=device.id,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_hash = hash_refresh_token(body.refresh_token)
    result = await db.execute(
        select(Session).where(
            Session.refresh_token_hash == token_hash,
            Session.expires_at > datetime.now(timezone.utc),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    # Rotate refresh token
    new_refresh = create_refresh_token()
    session.refresh_token_hash = hash_refresh_token(new_refresh)
    session.expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)

    access_token = create_access_token({"sub": str(session.user_id)})
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        user_id=session.user_id,
        device_id=session.device_id or uuid.uuid4(),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_hash = hash_refresh_token(body.refresh_token)
    await db.execute(delete(Session).where(Session.refresh_token_hash == token_hash))


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(Session).where(Session.user_id == user.id))


@router.post("/ws-ticket", response_model=WsTicketResponse)
async def ws_ticket(user: User = Depends(get_current_user)):
    redis = await get_redis()
    ticket = secrets.token_urlsafe(32)
    await redis.setex(f"ws_ticket:{ticket}", 30, str(user.id))
    return WsTicketResponse(ticket=ticket)
