"""restricciones: CHECK, triggers y la secuencia que el ORM no sabe declarar.

El upgrade ejecuta tal cual alembic/sql/restricciones.sql (copia de
docs/diseno/restricciones.sql). Si cambias uno, cambia el otro, o el diseño y la base
se van a contar historias distintas.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-06 10:19:22.714842

"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ARCHIVO_SQL = Path(__file__).resolve().parents[1] / "sql" / "restricciones.sql"


def upgrade() -> None:
    """Aplica restricciones.sql completo, funciones con $$ incluidas, en una sola pasada."""
    op.execute(sa.text(ARCHIVO_SQL.read_text(encoding="utf-8")))


def downgrade() -> None:
    """Deshace restricciones.sql en orden inverso: triggers, funciones, CHECK y secuencia."""
    op.execute(sa.text("""
        DROP SEQUENCE IF EXISTS analisis_codigo_seq;

        DROP TRIGGER IF EXISTS "analisis_caso_fijo" ON "Analisis";
        DROP TRIGGER IF EXISTS "caso_seudonimo_fijo" ON "CasoPaciente";
        DROP FUNCTION IF EXISTS seudonimo_inmutable();

        DROP TRIGGER IF EXISTS "bitacora_sin_truncate" ON "Bitacora";
        DROP TRIGGER IF EXISTS "bitacora_sin_cambios" ON "Bitacora";
        DROP FUNCTION IF EXISTS bitacora_inmutable();

        DROP TRIGGER IF EXISTS "modelo_un_vigente" ON "ModeloDesplegado";
        DROP FUNCTION IF EXISTS modelo_un_vigente();

        ALTER TABLE "Traslado" DROP CONSTRAINT IF EXISTS "traslado_distinto";
        ALTER TABLE "Usuario" DROP CONSTRAINT IF EXISTS "usuario_credenciales";
        ALTER TABLE "RegionInteres" DROP CONSTRAINT IF EXISTS "region_caja_rango";
        ALTER TABLE "ResultadoCaracteristica" DROP CONSTRAINT IF EXISTS "resultado_probabilidad_rango";
        ALTER TABLE "Caracteristica" DROP CONSTRAINT IF EXISTS "caract_umbral_rango";
        ALTER TABLE "ConfiguracionInferencia"
          DROP CONSTRAINT IF EXISTS "config_umbral_rango",
          DROP CONSTRAINT IF EXISTS "config_fila_unica";
    """))
