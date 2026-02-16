import logging
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.crypto.tokens import decode_access_token
from app.database import get_db
from app.dependencies import get_current_user
from app.models.attachment import Attachment
from app.models.membership import ChannelMember
from app.models.user import User
from app.schemas.attachment import AttachmentResponse

logger = logging.getLogger("d3chat.attachments")

router = APIRouter()

IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
THUMBNAIL_MAX_SIZE = (200, 200)


def _build_attachment_response(att: Attachment) -> AttachmentResponse:
    return AttachmentResponse(
        id=att.id,
        message_id=att.message_id,
        channel_id=att.channel_id,
        filename=att.filename,
        content_type=att.content_type,
        size_bytes=att.size_bytes,
        url=f"/api/v1/attachments/{att.id}/download",
        thumbnail_url=f"/api/v1/attachments/{att.id}/thumbnail" if att.thumbnail_path else None,
        width=att.width,
        height=att.height,
        created_at=att.created_at,
    )


@router.post(
    "/channels/{channel_id}/attachments",
    response_model=AttachmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    channel_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check membership
    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this channel")

    settings = get_settings()

    # Read file data with size limit
    data = await file.read()
    if len(data) > settings.max_file_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {settings.max_file_size_bytes // 1_048_576}MB",
        )

    content_type = file.content_type or "application/octet-stream"
    original_filename = file.filename or "upload"

    # Determine extension from original filename
    _, ext = os.path.splitext(original_filename)
    if not ext:
        ext = ""

    file_id = uuid.uuid4()
    storage_filename = f"{file_id}{ext}"
    channel_dir = os.path.join(settings.upload_dir, "attachments", str(channel_id))
    os.makedirs(channel_dir, exist_ok=True)
    storage_path = os.path.join(channel_dir, storage_filename)

    # Write file to disk
    with open(storage_path, "wb") as f:
        f.write(data)

    # Generate thumbnail for images
    thumbnail_path = None
    width = None
    height = None
    if content_type in IMAGE_CONTENT_TYPES:
        try:
            from PIL import Image
            import io

            img = Image.open(io.BytesIO(data))
            width, height = img.size

            thumb = img.copy()
            thumb.thumbnail(THUMBNAIL_MAX_SIZE)
            thumb_filename = f"{file_id}_thumb.webp"
            thumb_path = os.path.join(channel_dir, thumb_filename)
            thumb.save(thumb_path, "WEBP", quality=80)
            thumbnail_path = thumb_path
        except Exception as e:
            logger.warning(f"Thumbnail generation failed: {e}")

    attachment = Attachment(
        id=file_id,
        channel_id=channel_id,
        uploader_id=user.id,
        filename=original_filename,
        content_type=content_type,
        size_bytes=len(data),
        storage_path=storage_path,
        thumbnail_path=thumbnail_path,
        width=width,
        height=height,
    )
    db.add(attachment)
    await db.flush()

    logger.info(
        f"Attachment uploaded: id={attachment.id}, channel={channel_id}, "
        f"filename={original_filename}, size={len(data)}, content_type={content_type}"
    )

    return _build_attachment_response(attachment)


async def _resolve_user_from_token(token: str | None, db: AsyncSession) -> User:
    """Resolve a user from a query-string token (for img/download URLs)."""
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: uuid.UUID,
    token: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    resolved_user = await _resolve_user_from_token(token, db)

    result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Verify channel membership
    member_result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == attachment.channel_id,
            ChannelMember.user_id == resolved_user.id,
        )
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this channel")

    if not os.path.isfile(attachment.storage_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        attachment.storage_path,
        media_type=attachment.content_type,
        filename=attachment.filename,
    )


@router.get("/attachments/{attachment_id}/thumbnail")
async def get_thumbnail(
    attachment_id: uuid.UUID,
    token: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    # Auth via query token (thumbnails are always loaded via <img> tags)
    resolved_user = await _resolve_user_from_token(token, db)

    result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Verify channel membership
    member_result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == attachment.channel_id,
            ChannelMember.user_id == resolved_user.id,
        )
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this channel")

    if not attachment.thumbnail_path or not os.path.isfile(attachment.thumbnail_path):
        raise HTTPException(status_code=404, detail="Thumbnail not available")

    return FileResponse(attachment.thumbnail_path, media_type="image/webp")
