"""Add user profile columns

Revision ID: 005
Revises: 004
Create Date: 2026-02-15

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("avatar_path", sa.String(512), nullable=True))
    op.add_column("users", sa.Column("bio", sa.String(256), nullable=True))
    op.add_column("users", sa.Column("status_message", sa.String(128), nullable=True))
    op.add_column(
        "users",
        sa.Column("email_visible", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "users",
        sa.Column(
            "preferences",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "preferences")
    op.drop_column("users", "email_visible")
    op.drop_column("users", "status_message")
    op.drop_column("users", "bio")
    op.drop_column("users", "avatar_path")
    op.drop_column("users", "display_name")
