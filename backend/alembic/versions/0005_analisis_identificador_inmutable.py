"""protege la inmutabilidad del identificador de análisis (RNF-24).

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-27

"""

from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005"
down_revision: Union[str, Sequence[str], None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ARCHIVO_SQL = Path(__file__).resolve().parents[1] / "sql" / "analisis_identificador_inmutable.sql"


def upgrade() -> None:
    op.execute(sa.text(ARCHIVO_SQL.read_text(encoding="utf-8")))


def downgrade() -> None:
    op.execute(sa.text('DROP TRIGGER IF EXISTS "analisis_identificador_fijo" ON "Analisis"'))
    op.execute(sa.text("DROP FUNCTION IF EXISTS analisis_identificador_inmutable()"))
