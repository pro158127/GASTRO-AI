"""Traslado de casos entre doctores (RF-A06, RF-U11): mueve el caso y deja el rastro."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CasoPaciente, EstadoCaso, TipoTraslado, Traslado, TrasladoCaso


class RepositorioTraslados:
    def __init__(self, db: Session) -> None:
        self.db = db

    def casos_activos(
        self, doctor_id: UUID, caso_ids: list[UUID] | None = None
    ) -> list[CasoPaciente]:
        consulta = select(CasoPaciente).where(
            CasoPaciente.doctor_asignado_id == doctor_id, CasoPaciente.estado == EstadoCaso.ACTIVO
        )
        if caso_ids is not None:
            consulta = consulta.where(CasoPaciente.id.in_(caso_ids))
        # FOR UPDATE: nadie más mueve estos casos mientras se trasladan
        return list(self.db.scalars(consulta.with_for_update()))

    def sin_ver(self, destino_id: UUID) -> int:
        """Traslados hacia el doctor que no ha abierto y que aún le dejan algún caso."""
        con_casos_suyos = (
            select(TrasladoCaso.traslado_id)
            .join(CasoPaciente, CasoPaciente.id == TrasladoCaso.caso_id)
            .where(CasoPaciente.doctor_asignado_id == destino_id)
        )
        return int(
            self.db.scalar(
                select(func.count(Traslado.id)).where(
                    Traslado.destino_id == destino_id,
                    Traslado.visto_en.is_(None),
                    Traslado.id.in_(con_casos_suyos),
                )
            )
        )

    def trasladar(
        self,
        tipo: TipoTraslado,
        origen_id: UUID,
        destino_id: UUID,
        ejecutado_por: UUID,
        casos: list[CasoPaciente],
    ) -> Traslado:
        """Cambia el doctor asignado y registra el traslado con cada caso.

        Solo cambia doctor_asignado_id: el seudónimo y los análisis no se tocan (los
        triggers de 0002 lo impiden igual). El historial conserva quién era el origen.
        """
        traslado = Traslado(
            tipo=tipo, origen_id=origen_id, destino_id=destino_id, ejecutado_por=ejecutado_por
        )
        self.db.add(traslado)
        self.db.flush()
        for caso in casos:
            caso.doctor_asignado_id = destino_id
            self.db.add(TrasladoCaso(traslado_id=traslado.id, caso_id=caso.id))
        self.db.flush()
        return traslado
