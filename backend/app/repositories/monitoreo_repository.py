"""Consultas del área de salud del sistema: modelo vigente, métricas y logs técnicos.

Solo lectura y nada clínico. Del log de inferencia NUNCA sale `analisis_id` (RF-M03 CA 2):
la consulta ni siquiera lo selecciona, para que un log no se pueda cruzar con un caso.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Caracteristica,
    EstadoInferencia,
    LogInferencia,
    MetricaModelo,
    ModeloDesplegado,
)


@dataclass(frozen=True)
class FiltroLogs:
    estado: EstadoInferencia | None = None
    desde: datetime | None = None  # incluido
    hasta: datetime | None = None  # excluido (el día siguiente a las 00:00)
    pagina: int = 1
    por_pagina: int = 25


@dataclass(frozen=True)
class FilaLog:
    id: int
    ocurrido_en: datetime
    revision_modelo: str
    latencia_vision_ms: int
    latencia_llm_ms: int | None
    estado: EstadoInferencia
    codigo_error: str | None


class RepositorioMonitoreo:
    def __init__(self, db: Session) -> None:
        self.db = db

    def modelo_vigente(self) -> ModeloDesplegado | None:
        return self.db.scalar(select(ModeloDesplegado).where(ModeloDesplegado.es_vigente.is_(True)))

    def metricas(self, modelo_id: int) -> list[MetricaModelo]:
        """Todas las métricas del modelo, el reporte más reciente primero."""
        return list(
            self.db.scalars(
                select(MetricaModelo)
                .where(MetricaModelo.modelo_id == modelo_id)
                .options(selectinload(MetricaModelo.caracteristica))
                .order_by(MetricaModelo.fecha_reporte.desc(), MetricaModelo.id.desc())
            )
        )

    def caracteristicas_activas(self) -> list[Caracteristica]:
        return list(
            self.db.scalars(
                select(Caracteristica).where(Caracteristica.activa).order_by(Caracteristica.id)
            )
        )

    def logs(self, filtro: FiltroLogs) -> tuple[list[FilaLog], int]:
        """Página de logs técnicos, del más reciente al más viejo (el id desempata)."""
        condiciones = []
        if filtro.estado is not None:
            condiciones.append(LogInferencia.estado == filtro.estado)
        if filtro.desde is not None:
            condiciones.append(LogInferencia.ocurrido_en >= filtro.desde)
        if filtro.hasta is not None:
            condiciones.append(LogInferencia.ocurrido_en < filtro.hasta)
        total = self.db.scalar(select(func.count()).select_from(LogInferencia).where(*condiciones))
        filas = self.db.execute(
            select(
                LogInferencia.id,
                LogInferencia.ocurrido_en,
                ModeloDesplegado.revision_sha,
                LogInferencia.latencia_vision_ms,
                LogInferencia.latencia_llm_ms,
                LogInferencia.estado,
                LogInferencia.codigo_error,
            )
            .join(ModeloDesplegado, ModeloDesplegado.id == LogInferencia.modelo_id)
            .where(*condiciones)
            .order_by(LogInferencia.ocurrido_en.desc(), LogInferencia.id.desc())
            .offset((filtro.pagina - 1) * filtro.por_pagina)
            .limit(filtro.por_pagina)
        ).all()
        return [FilaLog(*f) for f in filas], int(total or 0)
