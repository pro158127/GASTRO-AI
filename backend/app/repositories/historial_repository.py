"""Historial del doctor: «Mis análisis» y «Buscar por paciente» (RF-H01, HIS-01, HIS-02).

Todo filtra por el caso asignado al doctor (`CasoPaciente.doctor_asignado_id`), no por
quién hizo el análisis: tras un traslado, el caso y su historial pasan al doctor que lo
recibe (RF-A07). Así un doctor nunca ve análisis de pacientes ajenos (RF-H01 CA 4 y 5).
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.seudonimo import Seudonimo
from app.models import (
    Analisis,
    Caracteristica,
    CasoPaciente,
    EstadoAnalisis,
    ResultadoCaracteristica,
)


class Origen(StrEnum):
    TODOS = "todos"
    PROPIOS = "propios"  # los que hizo el doctor
    RECIBIDOS = "recibidos"  # los que llegaron por traslado (los hizo otro)


@dataclass(frozen=True)
class FiltroHistorial:
    pagina: int = 1
    por_pagina: int = 20
    origen: Origen = Origen.TODOS
    estado: EstadoAnalisis | None = None
    codigo: str | None = None  # prefijo: «A-2026-0001» encuentra A-2026-000123
    caracteristica: str | None = None  # código; solo los análisis donde supera el umbral
    desde: datetime | None = None  # inclusivo
    hasta: datetime | None = None  # exclusivo (el servicio ya le suma el día)
    ascendente: bool = False  # False = más recientes primero
    seudonimos: tuple[Seudonimo, ...] = ()  # vacío = todos los pacientes del doctor


def de_paciente(seudonimos: tuple[Seudonimo, ...] | list[Seudonimo]):
    """Condición «el caso es de este paciente», con cualquier versión de la clave (RNF-28)."""
    return or_(
        *(
            and_(CasoPaciente.seudonimo == s.valor, CasoPaciente.version_clave == s.version_clave)
            for s in seudonimos
        )
    )


class RepositorioHistorial:
    def __init__(self, db: Session) -> None:
        self.db = db

    def listar(self, doctor_id: UUID, filtro: FiltroHistorial) -> tuple[list[Analisis], int]:
        condiciones = [CasoPaciente.doctor_asignado_id == doctor_id]
        if filtro.seudonimos:
            condiciones.append(de_paciente(filtro.seudonimos))
        if filtro.origen is Origen.PROPIOS:
            condiciones.append(Analisis.doctor_ejecutor_id == doctor_id)
        elif filtro.origen is Origen.RECIBIDOS:
            condiciones.append(Analisis.doctor_ejecutor_id != doctor_id)
        if filtro.estado is not None:
            condiciones.append(Analisis.estado == filtro.estado)
        if filtro.codigo:
            # Sin comodines del usuario: «%» y «_» se escapan, solo vale como prefijo
            prefijo = filtro.codigo.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
            condiciones.append(Analisis.codigo.like(f"{prefijo}%", escape="\\"))
        if filtro.caracteristica:
            condiciones.append(
                Analisis.resultados.any(
                    and_(
                        ResultadoCaracteristica.supera_umbral.is_(True),
                        ResultadoCaracteristica.caracteristica.has(
                            Caracteristica.codigo == filtro.caracteristica
                        ),
                    )
                )
            )
        if filtro.desde is not None:
            condiciones.append(Analisis.solicitado_en >= filtro.desde)
        if filtro.hasta is not None:
            condiciones.append(Analisis.solicitado_en < filtro.hasta)

        base = select(Analisis).join(CasoPaciente, Analisis.caso_id == CasoPaciente.id)
        total = self.db.scalar(
            select(func.count()).select_from(base.where(*condiciones).subquery())
        )
        orden = Analisis.solicitado_en.asc() if filtro.ascendente else Analisis.solicitado_en.desc()
        filas = self.db.scalars(
            base.where(*condiciones)
            .options(
                selectinload(Analisis.doctor_ejecutor),
                selectinload(Analisis.modelo),
                selectinload(Analisis.resultados).selectinload(
                    ResultadoCaracteristica.caracteristica
                ),
                selectinload(Analisis.observaciones),
            )
            .order_by(orden, Analisis.codigo)  # el código desempata: orden estable entre páginas
            .offset((filtro.pagina - 1) * filtro.por_pagina)
            .limit(filtro.por_pagina)
        ).all()
        return list(filas), int(total or 0)

    def casos_del_paciente(self, doctor_id: UUID, seudonimos: list[Seudonimo]) -> list[UUID]:
        """Casos del doctor con ese paciente, el más reciente primero (pueden ser varios si
        recibió por traslado un paciente que ya tenía)."""
        return list(
            self.db.scalars(
                select(CasoPaciente.id)
                .where(CasoPaciente.doctor_asignado_id == doctor_id, de_paciente(seudonimos))
                .order_by(CasoPaciente.creado_en.desc())
            )
        )
