import base64
import logging

from nacl.signing import SigningKey

from app.config import get_settings
from app.crypto.signing import generate_signing_keypair, load_signing_key

logger = logging.getLogger("d3chat.federation.identity")

_signing_key: SigningKey | None = None
_public_key_b64: str | None = None


async def init_server_identity(db_session) -> None:
    """Load or generate the server's Ed25519 signing key and upsert the local Server row."""
    global _signing_key, _public_key_b64

    settings = get_settings()

    if settings.signing_key_seed:
        seed = bytes.fromhex(settings.signing_key_seed)
        _signing_key = load_signing_key(seed)
        logger.info("Loaded Ed25519 signing key from config")
    else:
        seed, _pub = generate_signing_keypair()
        _signing_key = load_signing_key(seed)
        logger.warning(
            "No signing_key_seed configured — generated ephemeral key. "
            "Set SIGNING_KEY_SEED=%s in .env for persistence.",
            seed.hex(),
        )

    _public_key_b64 = base64.b64encode(bytes(_signing_key.verify_key)).decode("ascii")

    # Upsert local Server row
    from sqlalchemy import select
    from app.models.server import Server

    result = await db_session.execute(
        select(Server).where(Server.domain == settings.server_domain)
    )
    server = result.scalar_one_or_none()

    api_base = settings.api_base_url or f"http://{settings.server_domain}"

    if server:
        server.signing_key_public = _public_key_b64
        server.api_base_url = api_base
        server.is_local = True
        server.verified = True
    else:
        server = Server(
            domain=settings.server_domain,
            signing_key_public=_public_key_b64,
            api_base_url=api_base,
            is_local=True,
            verified=True,
            protocol_version=1,
        )
        db_session.add(server)

    await db_session.commit()
    logger.info("Server identity initialized: domain=%s", settings.server_domain)


def get_signing_key() -> SigningKey:
    """Return the server's Ed25519 signing key singleton."""
    if _signing_key is None:
        raise RuntimeError("Server identity not initialized — call init_server_identity() first")
    return _signing_key


def get_public_key_b64() -> str:
    """Return the server's Ed25519 public key as a base64 string."""
    if _public_key_b64 is None:
        raise RuntimeError("Server identity not initialized — call init_server_identity() first")
    return _public_key_b64
