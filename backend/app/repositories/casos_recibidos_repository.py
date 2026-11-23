"""Casos que le llegaron al doctor por traslado (RF-A07, TRAS-03 a TRAS-05).

Solo cuenta lo que sigue siendo del doctor: si un caso que recibió se trasladó otra vez a
alguien más, ya no aparece aquí (tampoco podría abrirlo). Nunca se expone qué administrador
hizo el traslado ni el seudónimo del paciente.
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from app.core.seudonimo import Seudonimo
from app.models import (
    Analisis,
    CasoPaciente,
    ResultadoCaracteristica,
    Traslado,
    TrasladoCaso,
    Usuario,
)
from app.repositories.historial_repository import de_paciente


@dataclass(frozen=True)
class ResumenCaso:
    caso_id: UUID
    total_analisis: int
    ultimo_analisis_en: datetime | None


class RepositorioCasosRecibidos:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _casos_mios(self, doctor_id: UUID, seudonimos: list[Seudonimo] | None):
        """El caso sigue asignado al doctor (y es del paciente, si se está buscando uno)."""
        condiciones = [CasoPaciente.doctor_asignado_id == doctor_id]
        if seudonimos:
            condiciones.append(de_paciente(seudonimos))
        return condiciones

    def traslados(
        self,
        doctor_id: UUID,
        origen_id: UUID | None = None,
        seudonimos: list[Seudonimo] | None = None,
    ) -> list[Traslado]:
        """Traslados hacia el doctor con algún caso que aún es suyo; el más reciente primero."""
        con_casos_mios = (
            select(TrasladoCaso.traslado_id)
            .join(CasoPaciente, CasoPaciente.id == TrasladoCaso.caso_id)
            .where(*self._casos_mios(doctor_id, seudonimos))
        )
        consulta = (
            select(Traslado)
            .where(Traslado.destino_id == doctor_id, Traslado.id.in_(con_casos_mios))
            .options(selectinload(Traslado.origen))
            .order_by(Traslado.ejecutado_en.desc(), Traslado.id)
        )
        if origen_id is not None:
            consulta = consulta.where(Traslado.origen_id == origen_id)
        return list(self.db.scalars(consulta))

    def casos(
        self, traslado_id: UUID, doctor_id: UUID, seudonimos: list[Seudonimo] | None = None
    ) -> list[ResumenCaso]:
        filas = self.db.execute(
            select(
                CasoPaciente.id,
                func.count(Analisis.id),
                func.max(Analisis.solicitado_en),
            )
            .join(TrasladoCaso, TrasladoCaso.caso_id == CasoPaciente.id)
            .outerjoin(Analisis, Analisis.caso_id == CasoPaciente.id)
            .where(
                TrasladoCaso.traslado_id == traslado_id, *self._casos_mios(doctor_id, seudonimos)
            )
            .group_by(CasoPaciente.id)
            .order_by(func.max(Analisis.solicitado_en).desc().nulls_last(), CasoPaciente.id)
        ).all()
        return [ResumenCaso(caso_id, int(total), ultimo) for caso_id, total, ultimo in filas]

    def analisis(
        self,
        traslado_id: UUID,
        doctor_id: UUID,
        limite: int | None,
        seudonimos: list[Seudonimo] | None = None,
    ) -> tuple[list[Analisis], int]:
        """Análisis de los casos de ese traslado, los más recientes primero. limite=None: todos."""
        condiciones = [
            TrasladoCaso.traslado_id == traslado_id,
            *self._casos_mios(doctor_id, seudonimos),
        ]
        base = (
            select(Analisis)
            .join(CasoPaciente, CasoPaciente.id == Analisis.caso_id)
            .join(TrasladoCaso, TrasladoCaso.caso_id == CasoPaciente.id)
            .where(*condiciones)
        )
        total = self.db.scalar(select(func.count()).select_from(base.subquery()))
        consulta = base.options(
            selectinload(Analisis.doctor_ejecutor),
            selectinload(Analisis.resultados).selectinload(ResultadoCaracteristica.caracteristica),
        ).order_by(Analisis.solicitado_en.desc(), Analisis.codigo)
        if limite is not None:
            consulta = consulta.limit(limite)
        return list(self.db.scalars(consulta)), int(total or 0)

    def nuevos(self, doctor_id: UUID) -> int:
        con_casos_mios = (
            select(TrasladoCaso.traslado_id)
            .join(CasoPaciente, CasoPaciente.id == TrasladoCaso.caso_id)
            .where(CasoPaciente.doctor_asignado_id == doctor_id)
        )
        return int(
            self.db.scalar(
                select(func.count(Traslado.id)).where(
                    Traslado.destino_id == doctor_id,
                    Traslado.visto_en.is_(None),
                    Traslado.id.in_(con_casos_mios),
                )
            )
        )

    def doctores_origen(self, doctor_id: UUID) -> list[Usuario]:
        """Pa el filtro «Doctor de origen»: quienes le han trasladado casos, sin repetir."""
        return list(
            self.db.scalars(
                select(Usuario)
                .where(
                    Usuario.id.in_(
                        select(Traslado.origen_id).where(Traslado.destino_id == doctor_id)
                    )
                )
                .order_by(Usuario.apellido, Usuario.nombre, Usuario.id)
            )
        )

    def marcar_visto(self, traslado_id: UUID, doctor_id: UUID, ahora: datetime) -> bool:
        """Marca el traslado como visto la primera vez. False si no es un traslado hacia él."""
        es_suyo = self.db.scalar(
            select(func.count(Traslado.id)).where(
                Traslado.id == traslado_id, Traslado.destino_id == doctor_id
            )
        )
        if not es_suyo:
            return False
        self.db.execute(
            update(Traslado)
            .where(Traslado.id == traslado_id, Traslado.visto_en.is_(None))
            .values(visto_en=ahora)
            .execution_options(synchronize_session="fetch")
        )
        return True

    def analisis_propios_del_paciente(self, doctor_id: UUID, seudonimos: list[Seudonimo]) -> int:
        """Análisis de ese paciente hechos por el doctor (aviso «también tiene N suyos»)."""
        return int(
            self.db.scalar(
                select(func.count(Analisis.id))
                .join(CasoPaciente, CasoPaciente.id == Analisis.caso_id)
                .where(
                    Analisis.doctor_ejecutor_id == doctor_id,
                    CasoPaciente.doctor_asignado_id == doctor_id,
                    de_paciente(seudonimos),
                )
            )
        )
