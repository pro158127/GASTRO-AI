"""Números del dashboard clínico del doctor (RF-DB01, DASH-01).

«Propios» = análisis COMPLETADOS que hizo el doctor y cuyo caso sigue asignado a él. Los casos
que recibió por traslado no se suman a sus indicadores ni a su concordancia (RF-A07 CA 2); se
informan aparte. Ninguna consulta devuelve seudónimos ni datos del paciente.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Analisis,
    Caracteristica,
    CasoPaciente,
    EstadoAnalisis,
    ObservacionProfesional,
    ResultadoCaracteristica,
    Traslado,
    TrasladoCaso,
    Valoracion,
)


class RepositorioDashboard:
    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _mios(doctor_id: UUID):
        """Hechos por el doctor y en un caso que sigue siendo suyo (cualquier estado)."""
        return and_(
            Analisis.doctor_ejecutor_id == doctor_id,
            Analisis.caso.has(CasoPaciente.doctor_asignado_id == doctor_id),
        )

    def _propios(self, doctor_id: UUID):
        return and_(self._mios(doctor_id), Analisis.estado == EstadoAnalisis.COMPLETADO)

    def tiene_analisis(self, doctor_id: UUID) -> bool:
        return bool(self.db.scalar(select(func.count(Analisis.id)).where(self._mios(doctor_id))))

    def contar_completados(self, doctor_id: UUID, desde: datetime | None = None) -> int:
        condiciones = [self._propios(doctor_id)]
        if desde is not None:
            condiciones.append(Analisis.solicitado_en >= desde)
        return int(self.db.scalar(select(func.count(Analisis.id)).where(*condiciones)))

    def sin_valoracion(self, doctor_id: UUID) -> int:
        """Completados propios sin la observación del doctor (pendientes de valorar)."""
        con_mia = select(ObservacionProfesional.analisis_id).where(
            ObservacionProfesional.autor_id == doctor_id
        )
        return int(
            self.db.scalar(
                select(func.count(Analisis.id)).where(
                    self._propios(doctor_id), Analisis.id.not_in(con_mia)
                )
            )
        )

    def recientes(self, doctor_id: UUID, cantidad: int = 5) -> list[Analisis]:
        return list(
            self.db.scalars(
                select(Analisis)
                .where(self._mios(doctor_id))
                .options(
                    selectinload(Analisis.resultados).selectinload(
                        ResultadoCaracteristica.caracteristica
                    )
                )
                .order_by(Analisis.solicitado_en.desc(), Analisis.codigo.desc())
                .limit(cantidad)
            )
        )

    def frecuencia(self, doctor_id: UUID) -> list[tuple[Caracteristica, int]]:
        """Por cada característica activa: en cuántos análisis propios superó el umbral.

        Se usa `supera_umbral` tal como se guardó: el umbral de ese día (RF-A01 CA 2). Las
        características sin ningún caso salen en 0, pa que la gráfica no cambie de forma.
        """
        conteo = (
            select(
                ResultadoCaracteristica.caracteristica_id,
                func.count(ResultadoCaracteristica.analisis_id).label("n"),
            )
            .join(Analisis, Analisis.id == ResultadoCaracteristica.analisis_id)
            .where(self._propios(doctor_id), ResultadoCaracteristica.supera_umbral.is_(True))
            .group_by(ResultadoCaracteristica.caracteristica_id)
            .subquery()
        )
        filas = self.db.execute(
            select(Caracteristica, func.coalesce(conteo.c.n, 0))
            .outerjoin(conteo, conteo.c.caracteristica_id == Caracteristica.id)
            .where(Caracteristica.activa.is_(True))
            .order_by(Caracteristica.id)
        ).all()
        return [(c, int(n)) for c, n in filas]

    def valoraciones(self, doctor_id: UUID) -> dict[Valoracion, int]:
        """Las observaciones del doctor sobre sus propios análisis, contadas por valoración."""
        filas = self.db.execute(
            select(ObservacionProfesional.valoracion, func.count())
            .join(Analisis, Analisis.id == ObservacionProfesional.analisis_id)
            .where(ObservacionProfesional.autor_id == doctor_id, self._propios(doctor_id))
            .group_by(ObservacionProfesional.valoracion)
        ).all()
        return {valoracion: int(n) for valoracion, n in filas}

    def pacientes_con_seguimiento(self, doctor_id: UUID) -> int:
        """Casos con dos o más análisis propios completados (RF-DB01 CA 6)."""
        por_caso = (
            select(Analisis.caso_id)
            .where(self._propios(doctor_id))
            .group_by(Analisis.caso_id)
            .having(func.count(Analisis.id) >= 2)
            .subquery()
        )
        return int(self.db.scalar(select(func.count()).select_from(por_caso)))

    def traslados_sin_ver(self, doctor_id: UUID) -> list[tuple[Traslado, int]]:
        """Traslados recibidos sin abrir, con cuántos de sus casos siguen siendo del doctor."""
        casos_mios = (
            select(TrasladoCaso.traslado_id, func.count().label("n"))
            .join(CasoPaciente, CasoPaciente.id == TrasladoCaso.caso_id)
            .where(CasoPaciente.doctor_asignado_id == doctor_id)
            .group_by(TrasladoCaso.traslado_id)
            .subquery()
        )
        filas = self.db.execute(
            select(Traslado, casos_mios.c.n)
            .join(casos_mios, casos_mios.c.traslado_id == Traslado.id)
            .where(Traslado.destino_id == doctor_id, Traslado.visto_en.is_(None))
            .options(selectinload(Traslado.origen))
            .order_by(Traslado.ejecutado_en.desc())
        ).all()
        return [(t, int(n)) for t, n in filas]

    def casos_recibidos(self, doctor_id: UUID) -> int:
        """Casos que le llegaron por traslado y que siguen siendo suyos."""
        return int(
            self.db.scalar(
                select(func.count(func.distinct(CasoPaciente.id)))
                .join(TrasladoCaso, TrasladoCaso.caso_id == CasoPaciente.id)
                .join(Traslado, Traslado.id == TrasladoCaso.traslado_id)
                .where(
                    Traslado.destino_id == doctor_id,
                    CasoPaciente.doctor_asignado_id == doctor_id,
                )
            )
        )
