# d3chat Encryption Architecture

## Trust Model

d3chat uses a **Signal-like trust model**: the server never sees plaintext message content. All encryption and decryption happens client-side.

## DMs: X3DH + AES-256-GCM

### Key Generation (per device)
Each device generates:
- **Identity key pair** (X25519) — long-term device identity
- **Signed pre-key** (X25519) — rotated weekly, signed with identity key
- **One-time pre-keys** (X25519) — batch of 20-50, consumed on use

### Key Exchange (X3DH-inspired)
1. Sender fetches ALL recipient device bundles
2. For each device, performs 3-4 ECDH operations:
   - DH(sender_identity, recipient_signed_prekey)
   - DH(sender_ephemeral, recipient_identity)
   - DH(sender_ephemeral, recipient_signed_prekey)
   - DH(sender_ephemeral, recipient_one_time_prekey) — if available
3. Derives shared secret via HKDF-SHA256
4. Encrypts message with AES-256-GCM using derived key

### Wire Format
```
version (1 byte) || nonce (12 bytes) || ciphertext || tag (16 bytes)
```
Base64-encoded for transport.

### Message Fan-out
DM messages are encrypted once per recipient device. The server stores all ciphertext variants.

## Groups: Sender Keys

### Setup
1. When joining a group, each device generates a **Sender Key** (AES key + chain key)
2. Distributes the Sender Key to all other group members' devices (encrypted via pairwise sessions)

### Encryption
- Sender encrypts message once with their Sender Key (AES-256-GCM)
- Chain key ratchets forward after each message (HMAC-SHA256)
- All members decrypt with the sender's distributed key

### Key Rotation
- Sender Key rotates when a member **leaves** (forward secrecy)
- Rotates after **100 messages** (limiting exposure)
- New members trigger re-distribution of existing sender keys

## Client-Side Key Storage

Keys stored in **IndexedDB** via Web Crypto API:
- Private keys as non-extractable `CryptoKey` objects where possible
- No server-side backup or recovery
- Lost device = lost keys = lost message history

## Key Verification (MITM Prevention)

**Safety numbers**: SHA-256 hash of both users' identity keys, displayed as numeric code.
Users compare out-of-band to verify no MITM. Safety number changes trigger UI warnings.

## Message Signing

All messages signed with sender's device identity key (Ed25519). Recipients verify before display.
