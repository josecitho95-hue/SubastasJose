"""Add auction payment and shipping fields

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add payment_status enum
    op.execute("CREATE TYPE auction_payment_status_enum AS ENUM ('pending', 'paid', 'overdue', 'refunded', 'not_required')")
    op.execute("CREATE TYPE auction_shipping_status_enum AS ENUM ('pending_payment', 'processing', 'shipped', 'delivered', 'cancelled')")

    # Add columns to auctions
    op.add_column('auctions', sa.Column('payment_status', sa.Enum('pending', 'paid', 'overdue', 'refunded', 'not_required', name='auction_payment_status_enum'), nullable=True))
    op.add_column('auctions', sa.Column('payment_deadline', sa.DateTime(timezone=True), nullable=True))
    op.add_column('auctions', sa.Column('penalty_amount', sa.Numeric(12, 2), default=0, nullable=True))
    op.add_column('auctions', sa.Column('admin_payment_approved', sa.Boolean, default=False, nullable=True))
    op.add_column('auctions', sa.Column('shipping_status', sa.Enum('pending_payment', 'processing', 'shipped', 'delivered', 'cancelled', name='auction_shipping_status_enum'), nullable=True))

    # Update existing rows to have sensible defaults
    op.execute("UPDATE auctions SET payment_status = 'not_required' WHERE status IN ('scheduled', 'active', 'cancelled')")
    op.execute("UPDATE auctions SET payment_status = 'paid' WHERE status = 'closed'")
    op.execute("UPDATE auctions SET payment_status = 'not_required' WHERE status = 'closed_no_sale'")
    op.execute("UPDATE auctions SET admin_payment_approved = false")
    op.execute("UPDATE auctions SET penalty_amount = 0")
    op.execute("UPDATE auctions SET shipping_status = 'pending_payment' WHERE status = 'closed'")
    op.execute("UPDATE auctions SET shipping_status = 'cancelled' WHERE status != 'closed'")

    # Make columns non-nullable after backfill
    op.alter_column('auctions', 'payment_status', nullable=False)
    op.alter_column('auctions', 'admin_payment_approved', nullable=False)
    op.alter_column('auctions', 'penalty_amount', nullable=False)
    op.alter_column('auctions', 'shipping_status', nullable=False)

    # Index for querying pending payments
    op.create_index('ix_auctions_payment_status', 'auctions', ['payment_status'])
    op.create_index('ix_auctions_shipping_status', 'auctions', ['shipping_status'])


def downgrade() -> None:
    op.drop_index('ix_auctions_shipping_status', table_name='auctions')
    op.drop_index('ix_auctions_payment_status', table_name='auctions')
    op.drop_column('auctions', 'shipping_status')
    op.drop_column('auctions', 'admin_payment_approved')
    op.drop_column('auctions', 'penalty_amount')
    op.drop_column('auctions', 'payment_deadline')
    op.drop_column('auctions', 'payment_status')
    op.execute("DROP TYPE auction_shipping_status_enum")
    op.execute("DROP TYPE auction_payment_status_enum")
