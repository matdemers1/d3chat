import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.crypto.signing import verify_request_signature
from app.database import get_db
from app.federation.discovery import discover_server, get_verify_key_for_server
from app.federation.handlers import dispatch_event
from app.models.user import User
from app.redis_client import redis_client
from app.schemas.federation import UserLookupResponse

logger = logging.getLogger("d3chat.federation.inbox")

router = APIRouter()

REPLAY_WINDOW_SECONDS = 300  # 5 minutes
RATE_LIMIT_PER_MINUTE = 100
EVENT_DEDUP_TTL = 86400  # 24 hours


async def _validate_federation_request(request: Request, db: AsyncSession) -> tuple[dict, bytes]:
    """Validate federation headers, replay window, rate limit, signature. Returns (parsed body, raw body)."""
    origin = request.headers.get("X-D3Chat-Origin")
    timestamp_str = request.headers.get("X-D3Chat-Timestamp")
    signature = request.headers.get("X-D3Chat-Signature")

    if not origin or not timestamp_str or not signature:
        raise HTTPException(status_code=401, detail="Missing federation headers")

    # Replay window check
    try:
        req_time = float(timestamp_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid timestamp")

    now = time.time()
    if abs(now - req_time) > REPLAY_WINDOW_SECONDS:
        raise HTTPException(status_code=401, detail="Request outside replay window")

    # Rate limit per origin (sliding window via Redis)
    rate_key = f"fed_rate:{origin}"
    try:
        current = await redis_client.incr(rate_key)
        if current == 1:
            await redis_client.expire(rate_key, 60)
        if current > RATE_LIMIT_PER_MINUTE:
            raise HTTPException(status_code=429, detail="Federation rate limit exceeded")
    except HTTPException:
        raise
    except Exception:
        pass  # If Redis is down, allow through

    # Discover origin server and get verify key
    try:
        server = await discover_server(origin, db)
    except Exception as e:
        logger.error("Failed to discover server %s: %s", origin, e)
        raise HTTPException(status_code=401, detail="Could not verify origin server")

    verify_key = get_verify_key_for_server(server)

    # Read body and verify signature
    body = await request.body()
    path = request.url.path
    method = request.method

    if not verify_request_signature(verify_key, signature, method, path, timestamp_str, body):
        raise HTTPException(status_code=401, detail="Invalid signature")

    import json
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    return parsed, body


@router.post("/federation/inbox")
async def federation_inbox(request: Request, db: AsyncSession = Depends(get_db)):
    """Single entry point for all inbound federation traffic."""
    parsed, body = await _validate_federation_request(request, db)

    event_id = parsed.get("event_id")
    if not event_id:
        raise HTTPException(status_code=400, detail="Missing event_id")

    event_type = parsed.get("type")
    if not event_type:
        raise HTTPException(status_code=400, detail="Missing event type")

    # Event ID dedup via Redis SET NX
    dedup_key = f"fed_event:{event_id}"
    try:
        is_new = await redis_client.set(dedup_key, "1", ex=EVENT_DEDUP_TTL, nx=True)
        if not is_new:
            return {"status": "duplicate", "event_id": event_id}
    except Exception:
        pass  # If Redis is down, process anyway

    # Dispatch to type-specific handler
    try:
        await dispatch_event(event_type, parsed, db)
    except Exception as e:
        logger.exception("Error handling federation event %s: %s", event_type, e)
        raise HTTPException(status_code=500, detail="Error processing event")

    return {"status": "ok", "event_id": event_id}


@router.get("/federation/user-lookup", response_model=UserLookupResponse)
async def federation_user_lookup(
    request: Request,
    username: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Signed federation request to look up a local user."""
    settings = get_settings()

    # Validate federation headers
    origin = request.headers.get("X-D3Chat-Origin")
    timestamp_str = request.headers.get("X-D3Chat-Timestamp")
    signature = request.headers.get("X-D3Chat-Signature")

    if not origin or not timestamp_str or not signature:
        raise HTTPException(status_code=401, detail="Missing federation headers")

    # Replay window
    try:
        req_time = float(timestamp_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid timestamp")

    now = time.time()
    if abs(now - req_time) > REPLAY_WINDOW_SECONDS:
        raise HTTPException(status_code=401, detail="Request outside replay window")

    # Discover and verify
    try:
        server = await discover_server(origin, db)
    except Exception:
        raise HTTPException(status_code=401, detail="Could not verify origin server")

    verify_key = get_verify_key_for_server(server)
    body = b""
    path = request.url.path + "?" + str(request.query_params)
    if not verify_request_signature(verify_key, signature, "GET", path, timestamp_str, body):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Look up local user
    result = await db.execute(
        select(User).where(
            User.username == username,
            User.server_domain == settings.server_domain,
            User.is_local == True,
        )
    )
    user = result.scalar_one_or_none()

    if user:
        return UserLookupResponse(
            found=True,
            username=user.username,
            user_id=user.id,
            server_domain=user.server_domain,
        )
    return UserLookupResponse(found=False)
