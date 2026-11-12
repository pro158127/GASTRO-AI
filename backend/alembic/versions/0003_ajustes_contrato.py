"""ajustes_contrato: lo que pidió el contrato del frontend sobre el diseño de la BD.

- TipoTraslado gana REASIGNACION (reasignación manual del admin, RF-A06).
- Analisis.etapa_proceso: la etapa que pinta W-07 (tipo nuevo EtapaProceso).
- RegionInteres.orden: «Región 1», «Región 2»… (W-08).
- Usuario.recorrido_visto_en: si ya vio el recorrido de TOPOLOGO.
- MetricaModelo: índice único parcial pa las métricas macro (caracteristica_id IS NULL),
  porque en Postgres los NULL no chocan en el UNIQUE de 0001.
Lo del bloqueo por seudónimo en POST /analisis es código, no esquema: va en el servicio.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-07 14:28:26.389788

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, Sequence[str], None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ETAPA_PROCESO = postgresql.ENUM(
    'ANONIMIZAR', 'CALIDAD', 'CLASIFICAR', 'GRAD_CAM', name='EtapaProceso'
)


def upgrade() -> None:
    # Alembic no compara valores de enum, así que este va a mano. En PG 16 se puede dentro
    # de la transacción; lo que no se puede es USAR el valor nuevo en la misma transacción.
    op.execute('ALTER TYPE "TipoTraslado" ADD VALUE IF NOT EXISTS \'REASIGNACION\'')

    # add_column no crea el tipo por su cuenta (create_table sí): hay que crearlo antes
    ETAPA_PROCESO.create(op.get_bind(), checkfirst=True)
    op.add_column('Analisis', sa.Column('etapa_proceso', ETAPA_PROCESO, nullable=True))
    op.add_column(
        'RegionInteres', sa.Column('orden', sa.Integer(), server_default=sa.text('1'), nullable=False)
    )
    op.add_column('Usuario', sa.Column('recorrido_visto_en', sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        'MetricaModelo_macro_unica',
        'MetricaModelo',
        ['modelo_id', 'metrica', 'conjunto_prueba'],
        unique=True,
        postgresql_where=sa.text('caracteristica_id IS NULL'),
    )


def downgrade() -> None:
    op.drop_index(
        'MetricaModelo_macro_unica',
        table_name='MetricaModelo',
        postgresql_where=sa.text('caracteristica_id IS NULL'),
    )
    op.drop_column('Usuario', 'recorrido_visto_en')
    op.drop_column('RegionInteres', 'orden')
    op.drop_column('Analisis', 'etapa_proceso')
    ETAPA_PROCESO.drop(op.get_bind(), checkfirst=True)

    # Postgres no deja quitar un valor de un enum: se recrea el tipo sin REASIGNACION.
    # Si ya hay traslados de ese tipo, esto truena a propósito (no se pierden datos callado).
    op.execute('ALTER TYPE "TipoTraslado" RENAME TO "TipoTraslado_0003"')
    op.execute('CREATE TYPE "TipoTraslado" AS ENUM (\'DESACTIVACION\', \'ELIMINACION\')')
    op.execute(
        'ALTER TABLE "Traslado" ALTER COLUMN tipo TYPE "TipoTraslado" '
        'USING tipo::text::"TipoTraslado"'
    )
    op.execute('DROP TYPE "TipoTraslado_0003"')
