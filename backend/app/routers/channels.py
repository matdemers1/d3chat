import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.channel import Channel
from app.models.membership import ChannelMember
from app.models.user import User
from app.redis_client import redis_client
from app.federation.relay import send_channel_invite
from app.schemas.channel import (
    AddMemberRequest,
    ChannelCreate,
    ChannelMemberResponse,
    ChannelResponse,
    ChannelUpdate,
    DMCreate,
)

logger = logging.getLogger("d3chat.channels")

router = APIRouter()


@router.post("", response_model=ChannelResponse, status_code=status.HTTP_201_CREATED)
async def create_channel(
    body: ChannelCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    channel = Channel(
        name=body.name,
        is_dm=body.is_dm,
        created_by=user.id,
        encryption_type=body.encryption_type,
    )
    db.add(channel)
    await db.flush()

    member = ChannelMember(channel_id=channel.id, user_id=user.id, role="owner")
    db.add(member)
    return channel


@router.get("", response_model=list[ChannelResponse])
async def list_channels(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Channel)
        .join(ChannelMember, ChannelMember.channel_id == Channel.id)
        .where(ChannelMember.user_id == user.id)
    )
    return result.scalars().all()


@router.get("/{channel_id}", response_model=ChannelResponse)
async def get_channel(
    channel_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    channel = await _get_channel_for_member(channel_id, user.id, db)
    return channel


@router.patch("/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    channel_id: uuid.UUID,
    body: ChannelUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    channel = await _get_channel_for_member(channel_id, user.id, db)
    if body.name is not None:
        channel.name = body.name
    db.add(channel)
    return channel


@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel(
    channel_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    channel = await _get_channel_for_member(channel_id, user.id, db, require_role="owner")
    await db.delete(channel)


@router.post("/{channel_id}/join", status_code=status.HTTP_204_NO_CONTENT)
async def join_channel(
    channel_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    existing = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        return

    member = ChannelMember(channel_id=channel_id, user_id=user.id, role="member")
    db.add(member)


@router.post("/{channel_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_channel(
    channel_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == user.id,
        )
    )
    member = result.scalar_one_or_none()
    if member:
        await db.delete(member)


@router.get("/{channel_id}/members", response_model=list[ChannelMemberResponse])
async def list_members(
    channel_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_channel_for_member(channel_id, user.id, db)
    result = await db.execute(
        select(ChannelMember)
        .options(selectinload(ChannelMember.user))
        .where(ChannelMember.channel_id == channel_id)
    )
    members = result.scalars().all()
    return [
        ChannelMemberResponse(
            user_id=m.user_id,
            username=m.user.username,
            server_domain=m.user.server_domain,
            is_local=m.user.is_local,
            role=m.role,
            joined_at=m.joined_at,
        )
        for m in members
    ]


@router.post("/{channel_id}/members", response_model=ChannelMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_member(
    channel_id: uuid.UUID,
    body: AddMemberRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a user to a channel. Only existing members can add others."""
    channel = await _get_channel_for_member(channel_id, user.id, db)
    if channel.is_dm:
        raise HTTPException(status_code=400, detail="Cannot add members to a DM")

    # Check target user exists
    target_result = await db.execute(select(User).where(User.id == body.user_id))
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if already a member
    existing = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == body.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member")

    # If target user is remote, mark channel as federated and send invite
    if not target.is_local:
        channel.is_federated = True
        db.add(channel)

    member = ChannelMember(channel_id=channel_id, user_id=body.user_id, role="member")
    db.add(member)
    await db.flush()
    await db.refresh(member)

    if not target.is_local:
        await send_channel_invite(channel, target, user, db)

    # Notify the added user about the new channel via Redis
    logger.info(f"Adding user {body.user_id} to channel {channel_id}")
    channel_data = {
        "type": "channel.new",
        "channel": {
            "id": str(channel.id),
            "name": channel.name,
            "is_dm": channel.is_dm,
            "is_federated": channel.is_federated,
            "encryption_type": channel.encryption_type,
            "created_by": str(channel.created_by) if channel.created_by else None,
            "created_at": channel.created_at.isoformat(),
        },
    }
    await redis_client.publish(
        f"user:{body.user_id}", json.dumps(channel_data)
    )

    return ChannelMemberResponse(
        user_id=target.id,
        username=target.username,
        server_domain=target.server_domain,
        is_local=target.is_local,
        role="member",
        joined_at=member.joined_at,
    )


@router.post("/dm", response_model=ChannelResponse, status_code=status.HTTP_201_CREATED)
async def create_dm(
    body: DMCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check for existing DM between these users
    result = await db.execute(
        select(Channel)
        .join(ChannelMember, ChannelMember.channel_id == Channel.id)
        .where(Channel.is_dm == True, ChannelMember.user_id == user.id)
    )
    my_dms = result.scalars().all()
    for dm in my_dms:
        members_result = await db.execute(
            select(ChannelMember.user_id).where(ChannelMember.channel_id == dm.id)
        )
        member_ids = set(members_result.scalars().all())
        if member_ids == {user.id, body.user_id}:
            return dm

    target_result = await db.execute(select(User).where(User.id == body.user_id))
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    channel = Channel(
        name=None,
        is_dm=True,
        created_by=user.id,
        encryption_type="x3dh",
    )
    db.add(channel)
    await db.flush()

    db.add(ChannelMember(channel_id=channel.id, user_id=user.id, role="member"))
    db.add(ChannelMember(channel_id=channel.id, user_id=body.user_id, role="member"))
    await db.flush()
    await db.refresh(channel)

    # Notify both users about the new DM channel
    logger.info(f"DM created: channel={channel.id}, creator={user.id}, recipient={body.user_id}")
    channel_data = {
        "type": "channel.new",
        "channel": {
            "id": str(channel.id),
            "name": channel.name,
            "is_dm": channel.is_dm,
            "is_federated": channel.is_federated,
            "encryption_type": channel.encryption_type,
            "created_by": str(channel.created_by) if channel.created_by else None,
            "created_at": channel.created_at.isoformat(),
        },
    }
    # Notify the recipient so their UI updates
    logger.info(f"Publishing channel.new to user:{body.user_id}")
    await redis_client.publish(
        f"user:{body.user_id}", json.dumps(channel_data)
    )
    # Also notify the creator (in case they have multiple devices/tabs)
    logger.info(f"Publishing channel.new to user:{user.id}")
    await redis_client.publish(
        f"user:{user.id}", json.dumps(channel_data)
    )

    return channel


async def _get_channel_for_member(
    channel_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
    require_role: str | None = None,
) -> Channel:
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    member_result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == user_id,
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this channel")

    if require_role and member.role != require_role:
        raise HTTPException(status_code=403, detail=f"Requires role: {require_role}")

    return channel
