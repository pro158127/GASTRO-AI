"""Escritura de las métricas del reporte de evaluación (RM-06). Solo la usa el script de carga."""

from datetime import date
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Caracteristica, MetricaModelo, ModeloDesplegado, NombreMetrica

# (id de la característica o None pa las macro, métrica, valor)
Fila = tuple[int | None, NombreMetrica, float]


class RepositorioCargaMetricas:
    def __init__(self, db: Session) -> None:
        self.db = db

    def modelo(self, repositorio_hf: str, revision_sha: str) -> ModeloDesplegado | None:
        return self.db.scalar(
            select(ModeloDesplegado).where(
                ModeloDesplegado.repositorio_hf == repositorio_hf,
                ModeloDesplegado.revision_sha == revision_sha,
            )
        )

    def caracteristicas(self) -> dict[str, int]:
        """Código → id de todas las características del catálogo (activas o no)."""
        return dict(self.db.execute(select(Caracteristica.codigo, Caracteristica.id)).all())

    def reemplazar(
        self,
        modelo_id: int,
        conjunto_prueba: str,
        fecha_reporte: date,
        filas: list[Fila],
    ) -> int:
        """Un reporte por modelo y conjunto de prueba: si se vuelve a cargar, se reemplaza.

        Así una corrección del equipo de ML no deja cifras viejas mezcladas con las nuevas.
        No hace commit (lo decide quien llama).
        """
        borradas = self.db.execute(
            delete(MetricaModelo).where(
                MetricaModelo.modelo_id == modelo_id,
                MetricaModelo.conjunto_prueba == conjunto_prueba,
            )
        ).rowcount
        self.db.add_all(
            MetricaModelo(
                modelo_id=modelo_id,
                caracteristica_id=caracteristica_id,
                metrica=metrica,
                valor=Decimal(str(valor)),
                conjunto_prueba=conjunto_prueba,
                fecha_reporte=fecha_reporte,
            )
            for caracteristica_id, metrica, valor in filas
        )
        self.db.flush()
        return borradas
