"""
d3chat Locust stress testing — simulates concurrent users performing
typical chat operations against a live server.

Usage:
  # Smoke test (100 users)
  locust --headless -u 100 -r 10 -t 2m --host http://localhost:8000

  # Medium load (1,000 users)
  locust --headless -u 1000 -r 50 -t 5m --host http://localhost:8000

  # Heavy load (10,000 users)
  locust --headless -u 10000 -r 200 -t 10m --host http://localhost:8000

  # Web UI
  locust --host http://localhost:8000
"""

import random
import time
import uuid

from locust import HttpUser, between, events, task

# Shared state: channels that all users can interact with
_shared_channels: list[str] = []
_channels_created = 0
_MAX_SHARED_CHANNELS = 20


class ChatUser(HttpUser):
    """
    Main user persona (~90% of users).
    Browses channels, reads messages, occasionally sends messages and searches.
    """

    weight = 9
    wait_time = between(1, 5)

    def on_start(self):
        """Register a unique user and store the JWT."""
        global _channels_created

        self.username = f"user_{uuid.uuid4().hex[:8]}_{int(time.time() * 1000) % 100000}"
        self.jwt = None
        self.user_id = None
        self.device_id = None
        self.my_channels: list[str] = []

        resp = self.client.post(
            "/api/v1/auth/register",
            json={
                "username": self.username,
                "password": "loadtest123",
                "device_name": "locust",
            },
            name="/api/v1/auth/register",
        )

        if resp.status_code == 201:
            data = resp.json()
            self.jwt = data["access_token"]
            self.user_id = data["user_id"]
            self.device_id = data["device_id"]
        else:
            # If registration fails (e.g. duplicate), try login
            resp = self.client.post(
                "/api/v1/auth/login",
                json={
                    "username": self.username,
                    "password": "loadtest123",
                },
                name="/api/v1/auth/login",
            )
            if resp.status_code == 200:
                data = resp.json()
                self.jwt = data["access_token"]
                self.user_id = data["user_id"]
                self.device_id = data["device_id"]

        if not self.jwt:
            return

        # First N users create shared channels
        if _channels_created < _MAX_SHARED_CHANNELS:
            _channels_created += 1
            ch_resp = self.client.post(
                "/api/v1/channels",
                json={"name": f"loadtest-{_channels_created}"},
                headers=self._auth_headers(),
                name="/api/v1/channels [create]",
            )
            if ch_resp.status_code == 201:
                ch_id = ch_resp.json()["id"]
                _shared_channels.append(ch_id)
                self.my_channels.append(ch_id)

        # Join some shared channels
        for ch_id in random.sample(
            _shared_channels, min(3, len(_shared_channels))
        ):
            if ch_id not in self.my_channels:
                self.client.post(
                    f"/api/v1/channels/{ch_id}/join",
                    headers=self._auth_headers(),
                    name="/api/v1/channels/{id}/join",
                )
                self.my_channels.append(ch_id)

    def _auth_headers(self) -> dict:
        return {"Authorization": f"Bearer {self.jwt}"} if self.jwt else {}

    def _random_channel(self) -> str | None:
        if self.my_channels:
            return random.choice(self.my_channels)
        if _shared_channels:
            return random.choice(_shared_channels)
        return None

    @task(3)
    def browse_channels(self):
        if not self.jwt:
            return
        self.client.get(
            "/api/v1/channels",
            headers=self._auth_headers(),
            name="/api/v1/channels",
        )

    @task(5)
    def read_messages(self):
        if not self.jwt:
            return
        ch_id = self._random_channel()
        if not ch_id:
            return
        self.client.get(
            f"/api/v1/channels/{ch_id}/messages",
            headers=self._auth_headers(),
            name="/api/v1/channels/{id}/messages",
        )

    @task(2)
    def send_message(self):
        if not self.jwt:
            return
        ch_id = self._random_channel()
        if not ch_id:
            return
        self.client.post(
            f"/api/v1/channels/{ch_id}/messages",
            json={"content": f"Load test message from {self.username} at {time.time():.0f}"},
            headers=self._auth_headers(),
            name="/api/v1/channels/{id}/messages [send]",
        )

    @task(1)
    def search_users(self):
        if not self.jwt:
            return
        self.client.get(
            "/api/v1/users/search?q=user",
            headers=self._auth_headers(),
            name="/api/v1/users/search",
        )


class ActiveChatter(HttpUser):
    """
    Power user persona (~10% of users).
    Same as ChatUser but sends messages at 3x the rate.
    """

    weight = 1
    wait_time = between(0.5, 2)

    def on_start(self):
        self.username = f"power_{uuid.uuid4().hex[:8]}_{int(time.time() * 1000) % 100000}"
        self.jwt = None
        self.user_id = None
        self.my_channels: list[str] = []

        resp = self.client.post(
            "/api/v1/auth/register",
            json={
                "username": self.username,
                "password": "loadtest123",
                "device_name": "locust-power",
            },
            name="/api/v1/auth/register",
        )

        if resp.status_code == 201:
            data = resp.json()
            self.jwt = data["access_token"]
            self.user_id = data["user_id"]

        if not self.jwt:
            return

        # Join shared channels
        for ch_id in random.sample(
            _shared_channels, min(5, len(_shared_channels))
        ):
            self.client.post(
                f"/api/v1/channels/{ch_id}/join",
                headers=self._auth_headers(),
                name="/api/v1/channels/{id}/join",
            )
            self.my_channels.append(ch_id)

    def _auth_headers(self) -> dict:
        return {"Authorization": f"Bearer {self.jwt}"} if self.jwt else {}

    def _random_channel(self) -> str | None:
        if self.my_channels:
            return random.choice(self.my_channels)
        if _shared_channels:
            return random.choice(_shared_channels)
        return None

    @task(2)
    def browse_channels(self):
        if not self.jwt:
            return
        self.client.get(
            "/api/v1/channels",
            headers=self._auth_headers(),
            name="/api/v1/channels",
        )

    @task(3)
    def read_messages(self):
        if not self.jwt:
            return
        ch_id = self._random_channel()
        if not ch_id:
            return
        self.client.get(
            f"/api/v1/channels/{ch_id}/messages",
            headers=self._auth_headers(),
            name="/api/v1/channels/{id}/messages",
        )

    @task(6)
    def send_message(self):
        if not self.jwt:
            return
        ch_id = self._random_channel()
        if not ch_id:
            return
        self.client.post(
            f"/api/v1/channels/{ch_id}/messages",
            json={"content": f"Power msg from {self.username}: {uuid.uuid4().hex[:8]}"},
            headers=self._auth_headers(),
            name="/api/v1/channels/{id}/messages [send]",
        )

    @task(1)
    def search_users(self):
        if not self.jwt:
            return
        self.client.get(
            "/api/v1/users/search?q=power",
            headers=self._auth_headers(),
            name="/api/v1/users/search",
        )
