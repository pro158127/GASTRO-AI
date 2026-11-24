"""Entrada y salida de POST /reportes (RF-H02, contrato §4)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class SolicitudReporte(BaseModel):
    """O una lista de análisis, o un caso (todos los análisis de ese paciente)."""

    analisis_ids: list[UUID] | None = Field(default=None, min_length=1, max_length=50)
    caso_id: UUID | None = None

    @model_validator(mode="after")
    def _uno_de_los_dos(self) -> "SolicitudReporte":
        if (self.analisis_ids is None) == (self.caso_id is None):
            raise ValueError("Envía analisis_ids o caso_id, uno de los dos.")
        return self


class ReporteCreado(BaseModel):
    id: UUID
    formato: str = "PDF"
    generado_en: datetime
    analisis: int  # cuántos análisis quedaron en el reporte
    descarga_url: str
