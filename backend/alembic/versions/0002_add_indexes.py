"""Add performance indexes and constraints

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-12 00:00:00.000000

Adds:
- UNIQUE partial index on bids (only one winning bid per auction)
- Partial index on auctions filtered by status='active'
- Composite index on auctions (status, start_time)
- Composite index on users (kyc_status, lifetime_deposit_mxn DESC)
- Composite index on transactions (wallet_id, created_at DESC)
- UNIQUE partial index on transactions (stripe_payment_intent_id) where NOT NULL
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Bids ────────────────────────────────────────────────────────────────
    # Guarantees only one winning bid per auction at the DB level.
    op.execute(
        "CREATE UNIQUE INDEX ix_bids_auction_winning "
        "ON bids (auction_id) WHERE is_winning = TRUE"
    )

    # ── Auctions ─────────────────────────────────────────────────────────────
    # Speeds up queries that filter active auctions by end_time (close_auctions task).
    op.execute(
        "CREATE INDEX ix_auctions_active_end "
        "ON auctions (end_time) WHERE status = 'active'"
    )

    # Composite index for listing / scheduling queries.
    op.create_index(
        'ix_auctions_status_start',
        'auctions',
        ['status', 'start_time'],
    )

    # ── Users ────────────────────────────────────────────────────────────────
    # Speeds up LFPIORPI reports that order by top depositors within a KYC tier.
    op.create_index(
        'ix_users_kyc_deposit',
        'users',
        ['kyc_status', sa.text('lifetime_deposit_mxn DESC')],
    )

    # ── Transactions ─────────────────────────────────────────────────────────
    # Covers the dashboard query: recent transactions per wallet.
    op.create_index(
        'ix_transactions_wallet_created',
        'transactions',
        ['wallet_id', sa.text('created_at DESC')],
    )

    # Prevents duplicate Stripe webhook processing at DB level.
    op.execute(
        "CREATE UNIQUE INDEX ix_transactions_stripe_unique "
        "ON transactions (stripe_payment_intent_id, type) "
        "WHERE stripe_payment_intent_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_transactions_stripe_unique")
    op.drop_index('ix_transactions_wallet_created', table_name='transactions')
    op.drop_index('ix_users_kyc_deposit', table_name='users')
    op.drop_index('ix_auctions_status_start', table_name='auctions')
    op.execute("DROP INDEX IF EXISTS ix_auctions_active_end")
    op.execute("DROP INDEX IF EXISTS ix_bids_auction_winning")
