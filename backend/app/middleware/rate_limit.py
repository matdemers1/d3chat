import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import get_settings
from app.redis_client import redis_client

settings = get_settings()


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for WebSocket, health, docs, and federation paths
        path = request.url.path
        if path in ("/ws", "/health", "/docs", "/redoc", "/openapi.json"):
            return await call_next(request)
        if path.startswith("/federation/") or path.startswith("/.well-known/"):
            return await call_next(request)
        # Skip CORS preflight requests — they don't hit business logic
        if request.method == "OPTIONS":
            return await call_next(request)

        # Use IP-based rate limiting for unauthenticated requests
        client_ip = request.client.host if request.client else "unknown"
        key = f"rate_limit:{client_ip}"

        try:
            current = await redis_client.incr(key)
            if current == 1:
                await redis_client.expire(key, 60)

            if current > settings.rate_limit_per_minute:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded"},
                    headers={"Retry-After": "10"},
                )
        except Exception:
            # If Redis is down, allow the request through
            pass

        return await call_next(request)
