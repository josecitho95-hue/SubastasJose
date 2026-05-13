"""Add penalty to transaction type enum

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add 'penalty' to transaction_type_enum
    op.execute("ALTER TYPE transaction_type_enum ADD VALUE 'penalty'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values directly.
    # To downgrade we would need to recreate the enum, which is complex
    # and risky. For this project we accept that penalty stays in the enum.
    pass
