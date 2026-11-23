"""Datos del reporte PDF (RF-H02). Solo análisis de casos asignados al doctor."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Analisis,
    CasoPaciente,
    FormatoReporte,
    ObservacionProfesional,
    Reporte,
    ReporteAnalisis,
    ResultadoCaracteristica,
)


class RepositorioReportes:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _de_mis_casos(self, doctor_id: UUID):
        # Mismo criterio que «Mis análisis»: propios y recibidos por traslado (RF-A07)
        return (
            select(Analisis)
            .join(CasoPaciente, Analisis.caso_id == CasoPaciente.id)
            .where(CasoPaciente.doctor_asignado_id == doctor_id)
            .options(
                selectinload(Analisis.modelo),
                selectinload(Analisis.doctor_ejecutor),
                selectinload(Analisis.resultados).selectinload(
                    ResultadoCaracteristica.caracteristica
                ),
                selectinload(Analisis.resultados).selectinload(ResultadoCaracteristica.regiones),
                selectinload(Analisis.explicacion),
                selectinload(Analisis.observaciones).selectinload(ObservacionProfesional.autor),
            )
            .order_by(Analisis.solicitado_en, Analisis.codigo)
        )

    def analisis(self, doctor_id: UUID, ids: list[UUID]) -> list[Analisis]:
        return list(self.db.scalars(self._de_mis_casos(doctor_id).where(Analisis.id.in_(ids))))

    def caso_es_mio(self, doctor_id: UUID, caso_id: UUID) -> bool:
        return (
            self.db.scalar(
                select(CasoPaciente.id).where(
                    CasoPaciente.id == caso_id, CasoPaciente.doctor_asignado_id == doctor_id
                )
            )
            is not None
        )

    def analisis_del_caso(self, doctor_id: UUID, caso_id: UUID) -> list[Analisis]:
        return list(
            self.db.scalars(self._de_mis_casos(doctor_id).where(Analisis.caso_id == caso_id))
        )

    def crear(self, doctor_id: UUID, analisis_ids: list[UUID]) -> Reporte:
        reporte = Reporte(doctor_id=doctor_id, formato=FormatoReporte.PDF)
        self.db.add(reporte)
        self.db.flush()
        self.db.add_all(ReporteAnalisis(reporte_id=reporte.id, analisis_id=i) for i in analisis_ids)
        self.db.flush()
        self.db.refresh(reporte, ["generado_en"])
        return reporte

    def del_doctor(self, reporte_id: UUID, doctor_id: UUID) -> Reporte | None:
        return self.db.scalar(
            select(Reporte).where(Reporte.id == reporte_id, Reporte.doctor_id == doctor_id)
        )

    def primer_codigo(self, reporte_id: UUID) -> str | None:
        """El código del análisis más antiguo del reporte, pa el nombre del archivo."""
        return self.db.scalar(
            select(Analisis.codigo)
            .join(ReporteAnalisis, ReporteAnalisis.analisis_id == Analisis.id)
            .where(ReporteAnalisis.reporte_id == reporte_id)
            .order_by(Analisis.solicitado_en, Analisis.codigo)
            .limit(1)
        )
