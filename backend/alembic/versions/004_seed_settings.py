"""Seed default server settings

Revision ID: 004
Revises: 003
Create Date: 2026-02-15

"""
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

server_settings = sa.table(
    "server_settings",
    sa.column("id", sa.Uuid),
    sa.column("key", sa.String),
    sa.column("value", sa.JSON),
    sa.column("category", sa.String),
    sa.column("description", sa.Text),
)

DEFAULT_SETTINGS = [
    {
        "id": uuid4(),
        "key": "app_name",
        "value": {"value": "d3chat"},
        "category": "general",
        "description": "Display name in UI",
    },
    {
        "id": uuid4(),
        "key": "app_description",
        "value": {"value": "Federated end-to-end encrypted chat"},
        "category": "general",
        "description": "Shown on login/register pages",
    },
    {
        "id": uuid4(),
        "key": "session_timeout_days",
        "value": {"value": 7},
        "category": "security",
        "description": "Refresh token expiry in days",
    },
    {
        "id": uuid4(),
        "key": "max_devices_per_user",
        "value": {"value": 10},
        "category": "security",
        "description": "Maximum devices per user",
    },
    {
        "id": uuid4(),
        "key": "registration_mode",
        "value": {"value": "open"},
        "category": "registration",
        "description": "Registration mode: open, closed, or invite_only",
    },
    {
        "id": uuid4(),
        "key": "registration_domain_allowlist",
        "value": {"value": []},
        "category": "registration",
        "description": "Allowed email domains (empty = all)",
    },
    {
        "id": uuid4(),
        "key": "brand_primary_color",
        "value": {"value": "#3b82f6"},
        "category": "branding",
        "description": "Primary accent color",
    },
    {
        "id": uuid4(),
        "key": "brand_accent_color",
        "value": {"value": "#10b981"},
        "category": "branding",
        "description": "Secondary accent color",
    },
    {
        "id": uuid4(),
        "key": "message_retention_days",
        "value": {"value": 0},
        "category": "retention",
        "description": "Days to keep messages (0 = forever)",
    },
]

SETTING_KEYS = [s["key"] for s in DEFAULT_SETTINGS]


def upgrade() -> None:
    op.bulk_insert(server_settings, DEFAULT_SETTINGS)


def downgrade() -> None:
    op.execute(
        server_settings.delete().where(server_settings.c.key.in_(SETTING_KEYS))
    )
