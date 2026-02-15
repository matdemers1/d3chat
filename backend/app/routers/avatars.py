import os
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import get_settings

router = APIRouter()

EXTENSIONS = ["webp", "png", "jpg", "gif"]


@router.get("/{user_id}")
async def get_avatar(user_id: uuid.UUID):
    settings = get_settings()
    avatar_dir = os.path.join(settings.upload_dir, "avatars")

    for ext in EXTENSIONS:
        filepath = os.path.join(avatar_dir, f"{user_id}.{ext}")
        if os.path.isfile(filepath):
            media_type = {
                "webp": "image/webp",
                "png": "image/png",
                "jpg": "image/jpeg",
                "gif": "image/gif",
            }[ext]
            return FileResponse(filepath, media_type=media_type)

    raise HTTPException(status_code=404, detail="Avatar not found")
