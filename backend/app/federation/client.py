import json
import logging
import time

import httpx

from app.config import get_settings
from app.crypto.signing import sign_request
from app.federation.identity import get_signing_key

logger = logging.getLogger("d3chat.federation.client")


async def send_federation_event(target_api_base_url: str, event_dict: dict) -> bool:
    """Sign and POST a federation event to a remote server's inbox. Returns True on success."""
    settings = get_settings()
    signing_key = get_signing_key()

    url = f"{target_api_base_url}/federation/inbox"
    path = "/federation/inbox"
    method = "POST"
    timestamp = str(time.time())
    body = json.dumps(event_dict).encode("utf-8")

    signature = sign_request(signing_key, method, path, timestamp, body)

    headers = {
        "Content-Type": "application/json",
        "X-D3Chat-Origin": settings.server_domain,
        "X-D3Chat-Timestamp": timestamp,
        "X-D3Chat-Signature": signature,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(url, content=body, headers=headers)
            if resp.status_code in (200, 201):
                logger.info("Federation event sent to %s: %s", target_api_base_url, event_dict.get("type"))
                return True
            logger.warning(
                "Federation event to %s returned %s: %s",
                target_api_base_url, resp.status_code, resp.text[:200],
            )
            return False
        except Exception as e:
            logger.error("Failed to send federation event to %s: %s", target_api_base_url, e)
            return False


async def send_signed_get(target_api_base_url: str, path: str) -> dict | None:
    """Send a signed GET request to a remote federation endpoint. Returns parsed JSON or None."""
    settings = get_settings()
    signing_key = get_signing_key()

    url = f"{target_api_base_url}{path}"
    method = "GET"
    timestamp = str(time.time())
    body = b""

    signature = sign_request(signing_key, method, path, timestamp, body)

    headers = {
        "X-D3Chat-Origin": settings.server_domain,
        "X-D3Chat-Timestamp": timestamp,
        "X-D3Chat-Signature": signature,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp.json()
            logger.warning("Signed GET to %s returned %s", url, resp.status_code)
            return None
        except Exception as e:
            logger.error("Signed GET to %s failed: %s", url, e)
            return None
