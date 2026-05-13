"""Add user terms, bid block and overdue tracking

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('terms_accepted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('can_bid', sa.Boolean, default=True, nullable=True))
    op.add_column('users', sa.Column('overdue_auctions_count', sa.Integer, default=0, nullable=True))

    # Backfill existing users
    op.execute("UPDATE users SET can_bid = true")
    op.execute("UPDATE users SET overdue_auctions_count = 0")

    # Make non-nullable after backfill
    op.alter_column('users', 'can_bid', nullable=False)
    op.alter_column('users', 'overdue_auctions_count', nullable=False)


def downgrade() -> None:
    op.drop_column('users', 'overdue_auctions_count')
    op.drop_column('users', 'can_bid')
    op.drop_column('users', 'terms_accepted_at')
