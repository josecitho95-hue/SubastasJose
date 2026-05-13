"""Expand item_category_enum with art, jewelry, collectibles

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0007'
down_revision: Union[str, None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL does not support removing enum values, so downgrade is a no-op.
    op.execute("ALTER TYPE item_category_enum ADD VALUE 'art'")
    op.execute("ALTER TYPE item_category_enum ADD VALUE 'jewelry'")
    op.execute("ALTER TYPE item_category_enum ADD VALUE 'collectibles'")


def downgrade() -> None:
    # NOTE: PostgreSQL does not provide a native way to remove values from an enum.
    # To reverse this migration you would need to recreate the enum column,
    # which is destructive and out of scope for a simple downgrade.
    pass
