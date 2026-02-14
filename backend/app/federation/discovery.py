import base64
import logging
import time

import httpx
from nacl.signing import VerifyKey
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto.signing import load_verify_key
from app.models.server import Server

logger = logging.getLogger("d3chat.federation.discovery")

# In-memory cache: domain -> (Server-like dict, expire_time)
_server_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL = 3600  # 1 hour


async def fetch_well_known(domain: str) -> dict:
    """Fetch /.well-known/d3chat-server from a remote domain."""
    url = f"https://{domain}/.well-known/d3chat-server"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError:
            # Fall back to HTTP for development
            url = f"http://{domain}/.well-known/d3chat-server"
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()


async def discover_server(domain: str, db: AsyncSession) -> Server:
    """Look up a remote server by domain. Checks DB first, then fetches well-known."""
    # Check in-memory cache
    now = time.time()
    if domain in _server_cache:
        cached, expires = _server_cache[domain]
        if now < expires:
            # Return the DB row (refresh from DB to get managed object)
            result = await db.execute(select(Server).where(Server.domain == domain))
            server = result.scalar_one_or_none()
            if server:
                return server

    # Check DB
    result = await db.execute(select(Server).where(Server.domain == domain))
    server = result.scalar_one_or_none()

    if server and server.signing_key_public:
        _server_cache[domain] = ({}, now + _CACHE_TTL)
        return server

    # Fetch from remote
    logger.info("Discovering server: %s", domain)
    well_known = await fetch_well_known(domain)

    api_base_url = well_known.get("api_base_url", f"http://{domain}")
    signing_key_public = well_known["signing_key_public"]
    protocol_version = well_known.get("protocol_version", 1)

    if server:
        server.signing_key_public = signing_key_public
        server.api_base_url = api_base_url
        server.protocol_version = protocol_version
        server.verified = True
    else:
        server = Server(
            domain=domain,
            signing_key_public=signing_key_public,
            api_base_url=api_base_url,
            is_local=False,
            verified=True,
            protocol_version=protocol_version,
        )
        db.add(server)
        await db.flush()

    _server_cache[domain] = ({}, now + _CACHE_TTL)
    return server


def get_verify_key_for_server(server: Server) -> VerifyKey:
    """Decode a Server's stored public key into a VerifyKey."""
    public_bytes = base64.b64decode(server.signing_key_public)
    return load_verify_key(public_bytes)
