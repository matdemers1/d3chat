"""Admin panel: roles, bans, audit logs, settings, analytics

Revision ID: 003
Revises: 002
Create Date: 2026-02-15

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add admin fields to users
    op.add_column("users", sa.Column("role", sa.String(16), server_default="user", nullable=False))
    op.add_column("users", sa.Column("is_banned", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("is_suspended", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("suspended_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("ban_reason", sa.Text(), nullable=True))
    op.create_index("ix_users_role", "users", ["role"])

    # Create audit_logs table
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("admin_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("target_id", sa.String(255), nullable=False),
        sa.Column("details", postgresql.JSONB(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    # Create server_settings table
    op.create_table(
        "server_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(128), unique=True, nullable=False),
        sa.Column("value", postgresql.JSONB(), nullable=True),
        sa.Column("category", sa.String(64), nullable=False, server_default="general"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )

    # Create analytics_daily table
    op.create_table(
        "analytics_daily",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("date", sa.Date(), unique=True, nullable=False),
        sa.Column("total_users", sa.Integer(), server_default="0"),
        sa.Column("new_users", sa.Integer(), server_default="0"),
        sa.Column("active_users", sa.Integer(), server_default="0"),
        sa.Column("total_messages", sa.Integer(), server_default="0"),
        sa.Column("new_messages", sa.Integer(), server_default="0"),
        sa.Column("total_channels", sa.Integer(), server_default="0"),
        sa.Column("new_channels", sa.Integer(), server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("analytics_daily")
    op.drop_table("server_settings")
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index("ix_users_role", table_name="users")
    op.drop_column("users", "ban_reason")
    op.drop_column("users", "suspended_until")
    op.drop_column("users", "is_suspended")
    op.drop_column("users", "is_banned")
    op.drop_column("users", "role")
