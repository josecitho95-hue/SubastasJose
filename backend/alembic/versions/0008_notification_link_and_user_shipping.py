"""Add link to notifications and shipping_address to users

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0008'
down_revision: Union[str, None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('notifications', sa.Column('link', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('notifications', 'link')
