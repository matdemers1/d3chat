"""Federation: drop sender_keys device FK

Revision ID: 002
Revises: 001
Create Date: 2026-02-14

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop FK constraint on sender_keys.device_id so we can store remote device UUIDs
    # that don't exist in the local devices table.
    op.drop_constraint("sender_keys_device_id_fkey", "sender_keys", type_="foreignkey")


def downgrade() -> None:
    op.create_foreign_key(
        "sender_keys_device_id_fkey",
        "sender_keys",
        "devices",
        ["device_id"],
        ["id"],
        ondelete="CASCADE",
    )
