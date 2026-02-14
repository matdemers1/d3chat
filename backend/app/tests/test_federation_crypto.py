import base64

import pytest

from app.crypto.signing import (
    generate_signing_keypair,
    load_signing_key,
    load_verify_key,
    sign_request,
    verify_request_signature,
)


def test_generate_keypair():
    seed, public = generate_signing_keypair()
    assert len(seed) == 32
    assert len(public) == 32


def test_load_signing_key():
    seed, _ = generate_signing_keypair()
    key = load_signing_key(seed)
    assert key is not None


def test_sign_and_verify_round_trip():
    seed, public = generate_signing_keypair()
    signing_key = load_signing_key(seed)
    verify_key = load_verify_key(public)

    method = "POST"
    path = "/federation/inbox"
    timestamp = "1700000000.0"
    body = b'{"type":"message.relay"}'

    signature = sign_request(signing_key, method, path, timestamp, body)
    assert verify_request_signature(verify_key, signature, method, path, timestamp, body)


def test_bad_signature():
    seed, public = generate_signing_keypair()
    signing_key = load_signing_key(seed)
    verify_key = load_verify_key(public)

    signature = sign_request(signing_key, "POST", "/path", "123", b"body")
    # Tamper with the signature
    sig_bytes = bytearray(base64.b64decode(signature))
    sig_bytes[0] ^= 0xFF
    bad_sig = base64.b64encode(bytes(sig_bytes)).decode()
    assert not verify_request_signature(verify_key, bad_sig, "POST", "/path", "123", b"body")


def test_wrong_key():
    seed1, _ = generate_signing_keypair()
    _, public2 = generate_signing_keypair()
    signing_key1 = load_signing_key(seed1)
    verify_key2 = load_verify_key(public2)

    signature = sign_request(signing_key1, "POST", "/path", "123", b"body")
    # Verify with wrong key should fail
    assert not verify_request_signature(verify_key2, signature, "POST", "/path", "123", b"body")


def test_tampered_body():
    seed, public = generate_signing_keypair()
    signing_key = load_signing_key(seed)
    verify_key = load_verify_key(public)

    signature = sign_request(signing_key, "POST", "/path", "123", b"original")
    assert not verify_request_signature(verify_key, signature, "POST", "/path", "123", b"tampered")


def test_deterministic_key_from_seed():
    seed = bytes.fromhex("aa" * 32)
    key1 = load_signing_key(seed)
    key2 = load_signing_key(seed)
    assert bytes(key1.verify_key) == bytes(key2.verify_key)
