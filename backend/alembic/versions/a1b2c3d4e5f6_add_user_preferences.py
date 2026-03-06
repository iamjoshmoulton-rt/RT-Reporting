"""add user_preferences table

Revision ID: a1b2c3d4e5f6
Revises: 393ecc3b686a
Create Date: 2026-03-05 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '393ecc3b686a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('user_preferences',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('timezone', sa.String(length=100), nullable=True),
        sa.Column('default_date_range', sa.String(length=50), nullable=True),
        sa.Column('default_group_by', sa.String(length=20), nullable=True),
        sa.Column('landing_page', sa.String(length=100), nullable=True),
        sa.Column('theme', sa.String(length=20), nullable=True),
        sa.Column('auto_refresh_interval', sa.Integer(), nullable=True),
        sa.Column('module_defaults', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_user_preferences_user_id'), 'user_preferences', ['user_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_user_preferences_user_id'), table_name='user_preferences')
    op.drop_table('user_preferences')
