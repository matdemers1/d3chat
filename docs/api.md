# d3chat API Reference

Base URL: `/api/v1`

Interactive docs available at `/docs` (Swagger UI) and `/redoc`.

## Authentication

All endpoints except `/auth/register`, `/auth/login`, and `/health` require a Bearer token.

### POST /auth/register
Create a new account and device.

### POST /auth/login
Authenticate and create a new device session.

### POST /auth/refresh
Refresh an access token using a refresh token.

### POST /auth/logout
Revoke a specific session.

### POST /auth/logout-all
Revoke all sessions for the authenticated user.

### POST /auth/ws-ticket
Exchange JWT for a one-time WebSocket ticket (valid 30 seconds).

## Users

### GET /users/me
Get current user profile.

### PATCH /users/me
Update current user profile.

### GET /users/{user_id}
Get a user by ID.

### GET /users/search?q=query
Search users by username.

### GET /users/lookup?identity=user@server
Look up a user by federated identity.

## Devices

### POST /devices
Register a new device.

### GET /devices
List current user's devices.

### DELETE /devices/{device_id}
Revoke a device.

## Channels

### POST /channels
Create a new channel.

### GET /channels
List channels the user is a member of.

### GET /channels/{channel_id}
Get channel details.

### PATCH /channels/{channel_id}
Update channel (name).

### DELETE /channels/{channel_id}
Delete a channel (owner only).

### POST /channels/{channel_id}/join
Join a channel.

### POST /channels/{channel_id}/leave
Leave a channel.

### GET /channels/{channel_id}/members
List channel members.

### POST /channels/dm
Create or get existing DM channel with a user.

## Messages

### GET /channels/{channel_id}/messages
Get paginated messages. Query params: `before` (datetime), `limit` (max 100).

### POST /channels/{channel_id}/messages
Send a message to a channel.

### PATCH /messages/{message_id}
Edit a message (own messages only).

### DELETE /messages/{message_id}
Delete a message (own messages only).

## Keys

### POST /keys/upload
Upload a device key bundle (identity key, signed pre-key, one-time pre-keys).

### GET /keys/{user_id}/bundles
Get all device key bundles for a user (consumes one OTP per device).

### GET /keys/{device_id}/bundle
Get key bundle for a specific device.

### POST /keys/one-time
Upload additional one-time pre-keys.

## WebSocket

Connect: `GET /ws?ticket=<one-time-ticket>`

### Message Types (client -> server)
- `typing.start` — `{ type, channel_id }`
- `typing.stop` — `{ type, channel_id }`
- `presence.update` — `{ type, status: "online"|"away"|"offline" }`
- `subscribe` — `{ type, channel_id }`

### Message Types (server -> client)
- `message.new` — new message in a channel
- `message.edit` — message edited
- `message.delete` — message deleted
- `typing.start` / `typing.stop` — typing indicators
