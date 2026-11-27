"""procesando_desde: desde cuándo está en proceso la entrega actual del análisis.

Lo renuevan POST /analisis, el reintento (ANA-05) y el worker en cada entrega. Con eso la
API cierra como FALLIDO un análisis que lleva demasiado en PROCESANDO porque el worker murió
y el mensaje no volvió (PROC-01). `solicitado_en` no sirve: no cambia al reintentar.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-25 20:00:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, Sequence[str], None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "Analisis", sa.Column("procesando_desde", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("Analisis", "procesando_desde")
