# d3chat Load Testing

Locust-based stress testing for d3chat backend.

## Setup

```bash
cd d3chat/loadtest
pip install -r requirements.txt
```

## Test Profiles

| Profile | Users | Spawn Rate | Duration | Command |
|---------|-------|------------|----------|---------|
| Smoke | 100 | 10/s | 2 min | `locust --headless -u 100 -r 10 -t 2m` |
| Medium | 1,000 | 50/s | 5 min | `locust --headless -u 1000 -r 50 -t 5m` |
| Heavy | 10,000 | 200/s | 10 min | `locust --headless -u 10000 -r 200 -t 10m` |

### Quick smoke test (30 seconds)

```bash
locust --headless -u 100 -r 10 -t 30s --host http://localhost:8000
```

### Web UI

```bash
locust --host http://localhost:8000
# Open http://localhost:8089
```

## User Personas

- **ChatUser** (90% of users): Browses channels, reads messages, occasionally sends messages, searches users.
- **ActiveChatter** (10% of users): Power user that sends messages at 3x the rate of a normal user.

## Rate Limit Configuration

All Locust users share one IP address, which will trigger the backend's rate limiter quickly. Before running stress tests, configure the backend to increase or disable the rate limit:

**Option A**: Set a high limit in `backend/.env`:
```
RATE_LIMIT_PER_MINUTE=100000
```

**Option B**: Disable the rate limit middleware entirely by commenting it out in `backend/app/main.py`:
```python
# app.add_middleware(RateLimitMiddleware)
```

## Shared State

The first 20 users each create a channel. All subsequent users join 3-5 of these shared channels, creating a realistic distribution of channel membership.
