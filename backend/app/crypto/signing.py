import base64
import hashlib

from nacl.signing import SigningKey, VerifyKey


def generate_signing_keypair() -> tuple[bytes, bytes]:
    """Generate an Ed25519 signing keypair. Returns (seed_bytes, public_bytes)."""
    signing_key = SigningKey.generate()
    return bytes(signing_key), bytes(signing_key.verify_key)


def load_signing_key(seed: bytes) -> SigningKey:
    """Load a SigningKey from a 32-byte seed."""
    return SigningKey(seed)


def load_verify_key(public_bytes: bytes) -> VerifyKey:
    """Load a VerifyKey from public key bytes."""
    return VerifyKey(public_bytes)


def _build_signing_payload(method: str, path: str, timestamp: str, body: bytes) -> bytes:
    body_hash = hashlib.sha256(body).hexdigest()
    payload = f"{method}\n{path}\n{timestamp}\n{body_hash}"
    return payload.encode("utf-8")


def sign_request(
    signing_key: SigningKey,
    method: str,
    path: str,
    timestamp: str,
    body: bytes,
) -> str:
    """Sign a federation request. Returns base64-encoded signature."""
    payload = _build_signing_payload(method, path, timestamp, body)
    signed = signing_key.sign(payload)
    return base64.b64encode(signed.signature).decode("ascii")


def verify_request_signature(
    verify_key: VerifyKey,
    signature_b64: str,
    method: str,
    path: str,
    timestamp: str,
    body: bytes,
) -> bool:
    """Verify an Ed25519 signature on a federation request."""
    try:
        payload = _build_signing_payload(method, path, timestamp, body)
        signature = base64.b64decode(signature_b64)
        verify_key.verify(payload, signature)
        return True
    except Exception:
        return False
