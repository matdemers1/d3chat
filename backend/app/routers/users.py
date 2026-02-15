import logging
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate, PublicUserProfile, PasswordChange

logger = logging.getLogger("d3chat.users")

router = APIRouter()

ALLOWED_AVATAR_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}


def _avatar_url(user: User) -> str | None:
    if user.avatar_path:
        return f"/api/v1/avatars/{user.id}"
    return None


def _user_response(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "server_domain": user.server_domain,
        "is_local": user.is_local,
        "role": user.role,
        "display_name": user.display_name,
        "avatar_url": _avatar_url(user),
        "bio": user.bio,
        "status_message": user.status_message,
        "email_visible": user.email_visible,
        "preferences": user.preferences,
        "created_at": user.created_at,
    }


def _public_profile(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email if user.email_visible else None,
        "server_domain": user.server_domain,
        "is_local": user.is_local,
        "role": user.role,
        "display_name": user.display_name,
        "avatar_url": _avatar_url(user),
        "bio": user.bio,
        "status_message": user.status_message,
        "created_at": user.created_at,
    }


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return _user_response(user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sent = body.model_fields_set
    if "username" in sent and body.username is not None:
        user.username = body.username
    if "email" in sent:
        user.email = body.email
    if "display_name" in sent:
        user.display_name = body.display_name
    if "bio" in sent:
        user.bio = body.bio
    if "status_message" in sent:
        user.status_message = body.status_message
    if "email_visible" in sent and body.email_visible is not None:
        user.email_visible = body.email_visible
    if "preferences" in sent and body.preferences is not None:
        user.preferences = body.preferences
    db.add(user)
    return _user_response(user)


@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()

    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=400, detail="File type not allowed. Use JPEG, PNG, WebP, or GIF.")

    data = await file.read()
    if len(data) > settings.max_avatar_size_bytes:
        raise HTTPException(status_code=400, detail="File too large. Maximum 2MB.")

    ext = ALLOWED_AVATAR_TYPES[file.content_type]
    avatar_dir = os.path.join(settings.upload_dir, "avatars")
    os.makedirs(avatar_dir, exist_ok=True)

    # Remove old avatar if exists
    _delete_avatar_file(user, settings.upload_dir)

    filename = f"{user.id}.{ext}"
    filepath = os.path.join(avatar_dir, filename)
    with open(filepath, "wb") as f:
        f.write(data)

    user.avatar_path = f"avatars/{filename}"
    db.add(user)
    return _user_response(user)


@router.delete("/me/avatar", response_model=UserResponse)
async def delete_avatar(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    _delete_avatar_file(user, settings.upload_dir)
    user.avatar_path = None
    db.add(user)
    return _user_response(user)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: PasswordChange,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.crypto.passwords import verify_password, hash_password

    if not user.password_hash:
        raise HTTPException(status_code=400, detail="Cannot change password for remote users")

    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    user.password_hash = hash_password(body.new_password)
    db.add(user)


@router.get("/search", response_model=list[PublicUserProfile])
async def search_users(
    q: str = Query(min_length=1),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(User).where(User.username.ilike(f"%{q}%")).limit(20)
    )
    return [_public_profile(u) for u in result.scalars().all()]


@router.get("/lookup", response_model=PublicUserProfile)
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
        return _public_profile(user)

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
                return _public_profile(remote_user)
        except Exception as e:
            logger.warning("Federation lookup failed for %s@%s: %s", username, domain, e)

    raise HTTPException(status_code=404, detail="User not found")


@router.get("/{user_id}", response_model=PublicUserProfile)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _public_profile(user)


def _delete_avatar_file(user: User, upload_dir: str) -> None:
    """Remove any existing avatar file for the user."""
    if not user.avatar_path:
        return
    filepath = os.path.join(upload_dir, user.avatar_path)
    if os.path.isfile(filepath):
        os.remove(filepath)
