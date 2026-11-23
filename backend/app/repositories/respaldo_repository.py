"""Lecturas pa el manifiesto del respaldo (RNF-26). Solo SELECT: nunca toca los datos."""

from collections.abc import Iterator

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Bitacora, ModeloDesplegado
from app.models.base import Base


class RepositorioRespaldo:
    def __init__(self, db: Session) -> None:
        self.db = db

    def conteos(self) -> dict[str, int]:
        """Cuántas filas tiene cada tabla del modelo, en orden alfabético."""
        return {
            tabla.name: int(self.db.scalar(select(func.count()).select_from(tabla)) or 0)
            for tabla in sorted(Base.metadata.sorted_tables, key=lambda t: t.name)
        }

    def bitacora(self) -> Iterator[Bitacora]:
        """La bitácora completa del id más viejo al más nuevo, de a poquitos."""
        return self.db.scalars(
            select(Bitacora).order_by(Bitacora.id).execution_options(yield_per=1000)
        )

    def modelo_vigente(self) -> ModeloDesplegado | None:
        return self.db.scalar(select(ModeloDesplegado).where(ModeloDesplegado.es_vigente))
