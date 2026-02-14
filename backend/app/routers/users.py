import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate

logger = logging.getLogger("d3chat.users")

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.username is not None:
        user.username = body.username
    if body.email is not None:
        user.email = body.email
    db.add(user)
    return user


@router.get("/search", response_model=list[UserResponse])
async def search_users(
    q: str = Query(min_length=1),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(User).where(User.username.ilike(f"%{q}%")).limit(20)
    )
    return result.scalars().all()


@router.get("/lookup", response_model=UserResponse)
async def lookup_user(
    identity: str = Query(description="user@server format"),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    parts = identity.split("@", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid identity format, use user@server")
    username, domain = parts

    # Check local DB first
    result = await db.execute(
        select(User).where(User.username == username, User.server_domain == domain)
    )
    user = result.scalar_one_or_none()
    if user:
        return user

    # If domain is remote, try federation lookup
    settings = get_settings()
    if domain != settings.server_domain:
        try:
            from app.federation.discovery import discover_server
            from app.federation.client import send_signed_get

            server = await discover_server(domain, db)
            api_base = server.api_base_url or f"http://{domain}"
            path = f"/federation/user-lookup?username={username}"
            data = await send_signed_get(api_base, path)

            if data and data.get("found"):
                # Create local record for the remote user
                remote_user = User(
                    username=data["username"],
                    server_domain=domain,
                    is_local=False,
                    password_hash=None,
                )
                db.add(remote_user)
                await db.flush()
                logger.info("Created remote user via lookup: %s@%s", username, domain)
                return remote_user
        except Exception as e:
            logger.warning("Federation lookup failed for %s@%s: %s", username, domain, e)

    raise HTTPException(status_code=404, detail="User not found")


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
