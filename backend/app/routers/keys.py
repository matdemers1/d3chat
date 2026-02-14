import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.channel import Channel
from app.models.device import Device
from app.models.key import DeviceKey
from app.models.sender_key import SenderKey
from app.models.user import User
from app.schemas.key import KeyBundleResponse, KeyBundleUpload, OneTimeKeyUpload
from app.schemas.sender_key import SenderKeyDistribute, SenderKeyResponse
from app.redis_client import get_redis
from app.federation.relay import relay_sender_key

router = APIRouter()


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_key_bundle(
    body: KeyBundleUpload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify device belongs to user
    result = await db.execute(
        select(Device).where(Device.id == body.device_id, Device.user_id == user.id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Upsert key bundle using PostgreSQL ON CONFLICT
    stmt = pg_insert(DeviceKey).values(
        device_id=body.device_id,
        identity_key=body.identity_key,
        signed_pre_key=body.signed_pre_key,
        signed_pre_key_signature=body.signed_pre_key_signature,
        one_time_pre_keys=body.one_time_pre_keys,
    ).on_conflict_do_update(
        index_elements=["device_id"],
        set_={
            "identity_key": body.identity_key,
            "signed_pre_key": body.signed_pre_key,
            "signed_pre_key_signature": body.signed_pre_key_signature,
            "one_time_pre_keys": body.one_time_pre_keys,
        },
    )
    await db.execute(stmt)

    return {"status": "ok"}


@router.get("/{user_id}/bundles", response_model=list[KeyBundleResponse])
async def get_user_key_bundles(
    user_id: uuid.UUID,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DeviceKey)
        .join(Device, Device.id == DeviceKey.device_id)
        .where(Device.user_id == user_id)
    )
    bundles = result.scalars().all()
    responses = []
    for bundle in bundles:
        otp = None
        otp_count = 0
        if bundle.one_time_pre_keys:
            otp_count = len(bundle.one_time_pre_keys)
            if otp_count > 0:
                otp = bundle.one_time_pre_keys.pop(0)
                # Save consumed key
                db.add(bundle)

                # Notify device owner if OTP count is low
                remaining = otp_count - 1
                if remaining < 10:
                    device = await db.execute(
                        select(Device).where(Device.id == bundle.device_id)
                    )
                    dev = device.scalar_one_or_none()
                    if dev:
                        redis = await get_redis()
                        await redis.publish(
                            f"user:{dev.user_id}",
                            json.dumps({
                                "type": "keys.low_otp",
                                "device_id": str(bundle.device_id),
                                "remaining": remaining,
                            }),
                        )

        responses.append(
            KeyBundleResponse(
                device_id=bundle.device_id,
                identity_key=bundle.identity_key,
                signed_pre_key=bundle.signed_pre_key,
                signed_pre_key_signature=bundle.signed_pre_key_signature,
                one_time_pre_key=otp,
                one_time_pre_key_count=otp_count,
            )
        )
    return responses


@router.get("/{device_id}/bundle", response_model=KeyBundleResponse)
async def get_device_key_bundle(
    device_id: uuid.UUID,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(DeviceKey).where(DeviceKey.device_id == device_id))
    bundle = result.scalar_one_or_none()
    if not bundle:
        raise HTTPException(status_code=404, detail="Key bundle not found")

    otp = None
    otp_count = 0
    if bundle.one_time_pre_keys:
        otp_count = len(bundle.one_time_pre_keys)
        if otp_count > 0:
            otp = bundle.one_time_pre_keys.pop(0)
            db.add(bundle)

            remaining = otp_count - 1
            if remaining < 10:
                device = await db.execute(
                    select(Device).where(Device.id == bundle.device_id)
                )
                dev = device.scalar_one_or_none()
                if dev:
                    redis = await get_redis()
                    await redis.publish(
                        f"user:{dev.user_id}",
                        json.dumps({
                            "type": "keys.low_otp",
                            "device_id": str(bundle.device_id),
                            "remaining": remaining,
                        }),
                    )

    return KeyBundleResponse(
        device_id=bundle.device_id,
        identity_key=bundle.identity_key,
        signed_pre_key=bundle.signed_pre_key,
        signed_pre_key_signature=bundle.signed_pre_key_signature,
        one_time_pre_key=otp,
        one_time_pre_key_count=otp_count,
    )


@router.post("/one-time", status_code=status.HTTP_201_CREATED)
async def upload_one_time_keys(
    body: OneTimeKeyUpload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Device).where(Device.id == body.device_id, Device.user_id == user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Device not found")

    key_result = await db.execute(select(DeviceKey).where(DeviceKey.device_id == body.device_id))
    bundle = key_result.scalar_one_or_none()
    if not bundle:
        raise HTTPException(status_code=404, detail="Key bundle not found, upload bundle first")

    existing = bundle.one_time_pre_keys or []
    bundle.one_time_pre_keys = existing + body.one_time_pre_keys
    db.add(bundle)
    return {"status": "ok", "count": len(bundle.one_time_pre_keys)}


# --- X3DH Setup (DM key exchange data) ---


class X3DHSetup(BaseModel):
    initiator_identity_key: str
    ephemeral_public_key: str
    used_one_time_key: bool = False


class X3DHSetupResponse(BaseModel):
    initiator_identity_key: str
    ephemeral_public_key: str
    used_one_time_key: bool


@router.post(
    "/channels/{channel_id}/x3dh-setup",
    status_code=status.HTTP_201_CREATED,
)
async def store_x3dh_setup(
    channel_id: uuid.UUID,
    body: X3DHSetup,
    _user: User = Depends(get_current_user),
):
    """Store X3DH handshake data so the DM responder can derive the session key."""
    redis = await get_redis()
    await redis.set(
        f"x3dh_setup:{channel_id}",
        json.dumps({
            "initiator_identity_key": body.initiator_identity_key,
            "ephemeral_public_key": body.ephemeral_public_key,
            "used_one_time_key": body.used_one_time_key,
        }),
        ex=86400 * 30,  # 30 days TTL
    )
    return {"status": "ok"}


@router.get(
    "/channels/{channel_id}/x3dh-setup",
    response_model=X3DHSetupResponse,
)
async def get_x3dh_setup(
    channel_id: uuid.UUID,
    _user: User = Depends(get_current_user),
):
    """Fetch X3DH handshake data for the responder to derive the session key."""
    redis = await get_redis()
    data = await redis.get(f"x3dh_setup:{channel_id}")
    if not data:
        raise HTTPException(status_code=404, detail="No X3DH setup data found")
    return X3DHSetupResponse(**json.loads(data))


# --- Sender Key Endpoints ---


@router.post(
    "/channels/{channel_id}/sender-keys",
    response_model=SenderKeyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def distribute_sender_key(
    channel_id: uuid.UUID,
    body: SenderKeyDistribute,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify device belongs to user
    result = await db.execute(
        select(Device).where(Device.id == body.device_id, Device.user_id == user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Device not found")

    # Upsert sender key for this device+channel
    existing = await db.execute(
        select(SenderKey).where(
            and_(
                SenderKey.channel_id == channel_id,
                SenderKey.device_id == body.device_id,
            )
        )
    )
    sender_key = existing.scalar_one_or_none()

    if sender_key:
        sender_key.sender_key_public = body.sender_key_public
        sender_key.chain_key = body.chain_key
        sender_key.message_number = 0
    else:
        sender_key = SenderKey(
            channel_id=channel_id,
            device_id=body.device_id,
            sender_key_public=body.sender_key_public,
            chain_key=body.chain_key,
            message_number=0,
        )
        db.add(sender_key)

    await db.flush()

    # Relay to remote servers if channel is federated
    ch_result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = ch_result.scalar_one_or_none()
    if channel and channel.is_federated:
        await relay_sender_key(
            channel_id,
            {
                "device_id": body.device_id,
                "sender_key_public": body.sender_key_public,
                "chain_key": body.chain_key,
            },
            user,
            db,
        )

    return sender_key


@router.get(
    "/channels/{channel_id}/sender-keys",
    response_model=list[SenderKeyResponse],
)
async def get_channel_sender_keys(
    channel_id: uuid.UUID,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SenderKey).where(SenderKey.channel_id == channel_id)
    )
    return result.scalars().all()
