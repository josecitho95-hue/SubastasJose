"""Initial migration

Revision ID: 0001
Revises: 
Create Date: 2026-05-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('email', sa.String(255), unique=True, nullable=False, index=True),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('is_active', sa.Boolean, default=True, nullable=False),
        sa.Column('is_verified', sa.Boolean, default=False, nullable=False),
        sa.Column('is_admin', sa.Boolean, default=False, nullable=False),
        sa.Column('kyc_status', sa.Enum('pending', 'approved', 'rejected', name='kyc_status_enum'), default='pending', nullable=False),
        sa.Column('kyc_level', sa.Enum('basic', 'enhanced', name='kyc_level_enum'), default='basic', nullable=False),
        sa.Column('curp', sa.String(18), nullable=True),
        sa.Column('rfc', sa.String(13), nullable=True),
        sa.Column('lifetime_deposit_mxn', sa.Numeric(14, 2), default=0, nullable=False),
        sa.Column('shipping_address', sa.JSON, nullable=True),
        sa.Column('stripe_customer_id', sa.String(255), nullable=True),
        sa.Column('stripe_connect_account_id', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    # Documents
    op.create_table(
        'documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('type', sa.Enum('ine', 'passport', 'proof_address', name='document_type_enum'), nullable=False),
        sa.Column('file_path', sa.String(500), nullable=False),
        sa.Column('status', sa.Enum('pending', 'approved', 'rejected', name='document_status_enum'), default='pending', nullable=False),
        sa.Column('reviewed_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('review_notes', sa.Text, nullable=True),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Wallets
    op.create_table(
        'wallets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), unique=True, nullable=False),
        sa.Column('balance', sa.Numeric(12, 2), default=0, nullable=False),
        sa.Column('held_balance', sa.Numeric(12, 2), default=0, nullable=False),
        sa.Column('currency', sa.String(3), default='MXN', nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    # Transactions
    op.create_table(
        'transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('wallet_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('wallets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('type', sa.Enum('deposit', 'hold', 'release', 'charge', 'refund', name='transaction_type_enum'), nullable=False),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('status', sa.Enum('pending', 'completed', 'failed', name='transaction_status_enum'), default='pending', nullable=False),
        sa.Column('stripe_payment_intent_id', sa.String(255), nullable=True),
        sa.Column('idempotency_key', sa.String(255), unique=True, nullable=False, index=True),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    # Items
    op.create_table(
        'items',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('category', sa.Enum('electronics', 'clothing', 'toys', 'other', name='item_category_enum'), nullable=False),
        sa.Column('condition', sa.Enum('new', 'used', 'refurbished', name='item_condition_enum'), nullable=False),
        sa.Column('images', sa.JSON, default=list, nullable=False),
        sa.Column('starting_price', sa.Numeric(12, 2), nullable=False),
        sa.Column('reserve_price', sa.Numeric(12, 2), nullable=True),
        sa.Column('min_bid_increment', sa.Numeric(12, 2), default=1, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    # Auctions
    op.create_table(
        'auctions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('item_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('items.id', ondelete='CASCADE'), nullable=False),
        sa.Column('seller_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.Enum('scheduled', 'active', 'closed', 'closed_no_sale', 'cancelled', name='auction_status_enum'), default='scheduled', nullable=False),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('current_price', sa.Numeric(12, 2), nullable=False),
        sa.Column('winning_bidder_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('final_price', sa.Numeric(12, 2), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    # Bids
    op.create_table(
        'bids',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('auction_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('auctions.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('is_winning', sa.Boolean, default=False, nullable=False),
        sa.Column('placed_at', sa.DateTime(timezone=True), nullable=False),
    )

    # Shipments
    op.create_table(
        'shipments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('auction_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('auctions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('winner_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('method', sa.Enum('standard', 'express', 'pickup', name='shipment_method_enum'), nullable=False),
        sa.Column('address', sa.JSON, nullable=False),
        sa.Column('status', sa.Enum('pending', 'shipped', 'delivered', name='shipment_status_enum'), default='pending', nullable=False),
        sa.Column('tracking_number', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    # Indexes
    op.create_index('ix_auctions_status_start_time', 'auctions', ['status', 'start_time'])
    op.create_index('ix_bids_auction_id_placed_at', 'bids', ['auction_id', 'placed_at'])
    op.create_index('ix_documents_user_id_status', 'documents', ['user_id', 'status'])
    op.create_index('ix_transactions_wallet_id_created_at', 'transactions', ['wallet_id', 'created_at'])


def downgrade() -> None:
    op.drop_table('shipments')
    op.drop_table('bids')
    op.drop_table('auctions')
    op.drop_table('items')
    op.drop_table('transactions')
    op.drop_table('wallets')
    op.drop_table('documents')
    op.drop_table('users')
