"""Casos de paciente por seudónimo. Solo los del doctor que pregunta (RF-H01 CA 4 y 5)."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.seudonimo import Seudonimo
from app.models import Analisis, CasoPaciente


@dataclass(frozen=True)
class HistorialPaciente:
    caso_id: UUID | None
    total_analisis: int
    ultimo_analisis_en: datetime | None


class RepositorioPacientes:
    def __init__(self, db: Session) -> None:
        self.db = db

    def historial(self, doctor_id: UUID, seudonimos: list[Seudonimo]) -> HistorialPaciente:
        """Casos del doctor con cualquiera de los seudónimos (uno por versión de clave).

        Ojo: el filtro va por (seudonimo, version_clave) en pareja; con la clave 2 el mismo
        documento da otro hex, así que ese par es lo que identifica al paciente.
        """
        de_este_paciente = and_(
            CasoPaciente.doctor_asignado_id == doctor_id,
            or_(
                *(
                    and_(
                        CasoPaciente.seudonimo == s.valor,
                        CasoPaciente.version_clave == s.version_clave,
                    )
                    for s in seudonimos
                )
            ),
        )
        total, ultimo = self.db.execute(
            select(func.count(Analisis.id), func.max(Analisis.solicitado_en))
            .join(CasoPaciente, Analisis.caso_id == CasoPaciente.id)
            .where(de_este_paciente)
        ).one()
        # El caso más reciente (puede haber más de uno si llegaron por traslado)
        caso_id = self.db.scalar(
            select(CasoPaciente.id)
            .where(de_este_paciente)
            .order_by(CasoPaciente.creado_en.desc())
            .limit(1)
        )
        return HistorialPaciente(caso_id, int(total or 0), ultimo)
