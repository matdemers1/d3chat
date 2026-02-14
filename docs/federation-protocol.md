# d3chat Federation Protocol

## Overview

d3chat supports open federation between self-hosted server instances. Any d3chat server can communicate with any other server. Server operators can blocklist specific domains.

## Server Identity

Each server has an **Ed25519 signing key pair**. The public key is published at:

```
GET /.well-known/d3chat-server
```

Response:
```json
{
  "domain": "chat.example.com",
  "signing_key_public": "base64-encoded-ed25519-public-key",
  "api_base_url": "https://chat.example.com",
  "protocol_version": 1
}
```

## User Identity

Users are identified as `username@server_domain` across federation.

## Server-to-Server Authentication

All federation requests are signed:

1. Construct signing payload: `METHOD\nPATH\nTIMESTAMP\nSHA256(BODY)`
2. Sign with server's Ed25519 private key
3. Include headers:
   - `X-D3Chat-Origin`: sender server domain
   - `X-D3Chat-Timestamp`: Unix timestamp
   - `X-D3Chat-Signature`: base64-encoded Ed25519 signature

Receiving server verifies:
- Timestamp within 5-minute replay window
- Signature valid against origin server's published key
- Event ID not previously processed (Redis dedup, 24h TTL)

## Federation Events

Events are POSTed to `/federation/inbox`:

| Event Type | Description |
|---|---|
| `message.relay` | Relay encrypted message to a channel |
| `sender_key.distribute` | Distribute sender key to remote members |
| `user.lookup_response` | Response to user lookup |
| `channel.invite` | Invite remote user to channel |
| `channel.join` | Remote user joining channel |
| `channel.leave` | Remote user leaving channel |

All events include:
- `event_id`: Unique ID for deduplication
- `origin_server`: Sending server domain
- `timestamp`: Unix timestamp
- `type`: Event type

## Rate Limiting

Per-origin-server sliding window rate limits (via Redis). Default: 100 requests/minute per federated server.

## Key Rotation

Servers can rotate signing keys:
- Publish new key with `valid_from` date
- Old key remains valid for 7-day grace period
- Key history at `/.well-known/d3chat-server/keys`
