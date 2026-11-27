"""Casos de paciente por seudónimo. Solo los del doctor que pregunta (RF-H01 CA 4 y 5)."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import ColumnElement, and_, exists, func, or_, select
from sqlalchemy.orm import Session

from app.core.seudonimo import Seudonimo
from app.models import Analisis, CasoPaciente, EstadoAnalisis


@dataclass(frozen=True)
class HistorialPaciente:
    caso_id: UUID | None
    total_analisis: int
    ultimo_analisis_en: datetime | None


def casos_del_paciente(doctor_id: UUID, seudonimos: list[Seudonimo]) -> ColumnElement[bool]:
    """Casos del doctor con cualquiera de los seudónimos (uno por versión de clave).

    Ojo: el filtro va por (seudonimo, version_clave) en pareja; con la clave 2 el mismo
    documento da otro hex, así que ese par es lo que identifica al paciente.
    """
    return and_(
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


def tiene_historial(doctor_id: UUID, seudonimos: list[Seudonimo]) -> ColumnElement[bool]:
    """¿Hay al menos un análisis COMPLETADO de este paciente con este doctor?

    Solo cuentan los completados: un análisis FALLIDO (o todavía en proceso) no prueba
    que el documento esté bien escrito. Si contara, un número mal digitado cuyo análisis
    falló pasaría la próxima vez sin pedir confirmación (RF-D01, W-06i).
    """
    return exists(
        select(Analisis.id)
        .join(CasoPaciente, Analisis.caso_id == CasoPaciente.id)
        .where(
            casos_del_paciente(doctor_id, seudonimos),
            Analisis.estado == EstadoAnalisis.COMPLETADO,
        )
    )


class RepositorioPacientes:
    def __init__(self, db: Session) -> None:
        self.db = db

    def historial(self, doctor_id: UUID, seudonimos: list[Seudonimo]) -> HistorialPaciente:
        """Análisis COMPLETADOS del paciente con este doctor y la fecha del último que terminó.

        Sin completados no hay historial (caso_id None), aunque exista el caso con
        análisis fallidos: así la consulta y POST /analisis piden la confirmación igual.
        """
        de_este_paciente = casos_del_paciente(doctor_id, seudonimos)
        total, ultimo = self.db.execute(
            select(func.count(Analisis.id), func.max(Analisis.completado_en))
            .join(CasoPaciente, Analisis.caso_id == CasoPaciente.id)
            .where(de_este_paciente, Analisis.estado == EstadoAnalisis.COMPLETADO)
        ).one()
        if not total:
            return HistorialPaciente(None, 0, None)
        # El caso más reciente (puede haber más de uno si llegaron por traslado)
        caso_id = self.db.scalar(
            select(CasoPaciente.id)
            .where(de_este_paciente)
            .order_by(CasoPaciente.creado_en.desc())
            .limit(1)
        )
        return HistorialPaciente(caso_id, int(total), ultimo)
