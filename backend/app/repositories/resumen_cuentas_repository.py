"""Datos extra de las cuentas para las pantallas del administrador (W-09, W-11, W-20, W-25).

Solo lectura. Nada clínico: de los casos activos de un doctor solo sale el código y la fecha
de cada análisis (RF-A06 CA 2), sin imágenes, resultados ni datos del paciente.
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    AccionBitacora,
    Analisis,
    Bitacora,
    CasoPaciente,
    EnvioCredencial,
    EstadoCaso,
    EstadoUsuario,
    Traslado,
    TrasladoCaso,
    Usuario,
)


@dataclass(frozen=True)
class Conteos:
    activos: int
    pendientes: int  # pendientes con la temporal vigente
    expiradas: int  # pendientes con la temporal vencida
    inactivos: int
    bloqueadas: int  # con bloqueo temporal en curso (no eliminadas)
    eliminadas: int


@dataclass(frozen=True)
class AnalisisDeCaso:
    id: UUID
    codigo: str
    solicitado_en: datetime


@dataclass(frozen=True)
class CasoActivo:
    caso_id: UUID
    analisis: list[AnalisisDeCaso]


@dataclass(frozen=True)
class UltimoTraslado:
    traslado: Traslado
    casos: int


class RepositorioResumenCuentas:
    def __init__(self, db: Session) -> None:
        self.db = db

    def usuario(self, usuario_id: UUID) -> Usuario | None:
        return self.db.get(Usuario, usuario_id)

    def conteos(self, ahora: datetime) -> Conteos:
        """Cuántas cuentas hay en cada estado, para el resumen de W-09 (sin filtros)."""
        vencida = (Usuario.temporal_expira_en.is_not(None)) & (Usuario.temporal_expira_en < ahora)
        pendiente = Usuario.estado == EstadoUsuario.PENDIENTE
        fila = self.db.execute(
            select(
                func.count(case((Usuario.estado == EstadoUsuario.ACTIVO, 1))),
                func.count(case((pendiente & ~vencida, 1))),
                func.count(case((pendiente & vencida, 1))),
                func.count(case((Usuario.estado == EstadoUsuario.INACTIVO, 1))),
                func.count(
                    case(
                        (
                            (Usuario.estado != EstadoUsuario.ELIMINADO)
                            & Usuario.bloqueado_hasta.is_not(None)
                            & (Usuario.bloqueado_hasta > ahora),
                            1,
                        )
                    )
                ),
                func.count(case((Usuario.estado == EstadoUsuario.ELIMINADO, 1))),
            )
        ).one()
        return Conteos(*(int(n) for n in fila))

    def ultimos_envios(self, usuario_ids: list[UUID]) -> dict[UUID, EnvioCredencial]:
        """El envío de credencial más reciente de cada cuenta (una sola consulta)."""
        if not usuario_ids:
            return {}
        numerados = (
            select(
                EnvioCredencial.id,
                func.row_number()
                .over(
                    partition_by=EnvioCredencial.usuario_id,
                    order_by=(EnvioCredencial.intentado_en.desc(), EnvioCredencial.id.desc()),
                )
                .label("n"),
            )
            .where(EnvioCredencial.usuario_id.in_(usuario_ids))
            .subquery()
        )
        envios = self.db.scalars(
            select(EnvioCredencial)
            .join(numerados, numerados.c.id == EnvioCredencial.id)
            .where(numerados.c.n == 1)
        )
        return {e.usuario_id: e for e in envios}

    def ultimo_evento(self, accion: AccionBitacora, usuario_id: UUID) -> datetime | None:
        """Cuándo fue la última vez que esa acción recayó sobre la cuenta (según la bitácora)."""
        return self.db.scalar(
            select(func.max(Bitacora.ocurrido_en)).where(
                Bitacora.accion == accion,
                Bitacora.entidad == "Usuario",
                Bitacora.entidad_id == str(usuario_id),
            )
        )

    def ultimo_traslado_desde(self, usuario_id: UUID) -> UltimoTraslado | None:
        """El traslado más reciente de casos de este doctor hacia otro, con cuántos casos movió."""
        fila = self.db.execute(
            select(Traslado, func.count(TrasladoCaso.caso_id))
            .join(TrasladoCaso, TrasladoCaso.traslado_id == Traslado.id)
            .where(Traslado.origen_id == usuario_id)
            .options(selectinload(Traslado.destino))
            .group_by(Traslado.id)
            .order_by(Traslado.ejecutado_en.desc())
            .limit(1)
        ).first()
        return UltimoTraslado(fila[0], int(fila[1])) if fila else None

    def casos_activos(self, doctor_id: UUID) -> list[CasoActivo]:
        """Casos activos del doctor con el código y la fecha de cada análisis (W-25)."""
        casos = self.db.scalars(
            select(CasoPaciente)
            .where(
                CasoPaciente.doctor_asignado_id == doctor_id,
                CasoPaciente.estado == EstadoCaso.ACTIVO,
            )
            .order_by(CasoPaciente.creado_en.desc(), CasoPaciente.id)
        ).all()
        if not casos:
            return []
        filas = self.db.execute(
            select(Analisis.caso_id, Analisis.id, Analisis.codigo, Analisis.solicitado_en)
            .where(Analisis.caso_id.in_([c.id for c in casos]))
            .order_by(Analisis.solicitado_en.desc(), Analisis.codigo.desc())
        ).all()
        por_caso: dict[UUID, list[AnalisisDeCaso]] = {c.id: [] for c in casos}
        for caso_id, analisis_id, codigo, fecha in filas:
            por_caso[caso_id].append(AnalisisDeCaso(analisis_id, codigo, fecha))
        return [CasoActivo(c.id, por_caso[c.id]) for c in casos]
