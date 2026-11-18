"""Repositorio de la bitácora: inserta y consulta. Sin update ni delete, ni aquí ni en la base."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import AccionBitacora, Bitacora, ResultadoAccion, Usuario
from app.services.auditoria import EventoAuditoria


@dataclass(frozen=True)
class FiltroBitacora:
    pagina: int = 1
    por_pagina: int = 25
    accion: AccionBitacora | None = None
    resultado: ResultadoAccion | None = None
    actor_id: UUID | None = None
    actor_texto: str | None = None  # parte del nombre o apellido de quien hizo la acción
    desde: datetime | None = None  # inclusivo
    hasta: datetime | None = None  # exclusivo


class RepositorioBitacora:
    def __init__(self, db: Session) -> None:
        self.db = db

    def insertar(self, evento: EventoAuditoria) -> None:
        # Va en la misma sesión que la acción auditada: si la acción se revierte, el registro
        # también, y si el registro falla, la acción no queda a escondidas. Sin commit aquí.
        self.db.add(
            Bitacora(
                actor_id=evento.actor_id,
                accion=evento.accion,
                resultado=evento.resultado,
                entidad=evento.entidad,
                entidad_id=evento.entidad_id,
                detalle=dict(evento.detalle) if evento.detalle is not None else None,
                ip=evento.ip,
            )
        )

    # ------------------------------------------------------- consulta (RF-A02, W-21)

    @staticmethod
    def _condiciones(filtro: FiltroBitacora) -> list:
        condiciones = []
        if filtro.accion is not None:
            condiciones.append(Bitacora.accion == filtro.accion)
        if filtro.resultado is not None:
            condiciones.append(Bitacora.resultado == filtro.resultado)
        if filtro.actor_id is not None:
            condiciones.append(Bitacora.actor_id == filtro.actor_id)
        if filtro.actor_texto:
            patron = f"%{filtro.actor_texto}%"
            condiciones.append(
                Bitacora.actor.has(
                    or_(Usuario.nombre.ilike(patron), Usuario.apellido.ilike(patron))
                )
            )
        if filtro.desde is not None:
            condiciones.append(Bitacora.ocurrido_en >= filtro.desde)
        if filtro.hasta is not None:
            condiciones.append(Bitacora.ocurrido_en < filtro.hasta)
        return condiciones

    def listar(self, filtro: FiltroBitacora) -> tuple[list[Bitacora], int]:
        """Página de la bitácora, lo más reciente primero."""
        condiciones = self._condiciones(filtro)
        total = self.db.scalar(select(func.count(Bitacora.id)).where(*condiciones))
        filas = self.db.scalars(
            select(Bitacora)
            .where(*condiciones)
            .options(selectinload(Bitacora.actor))
            .order_by(Bitacora.ocurrido_en.desc(), Bitacora.id.desc())
            .offset((filtro.pagina - 1) * filtro.por_pagina)
            .limit(filtro.por_pagina)
        ).all()
        return list(filas), int(total or 0)

    def para_exportar(
        self, acciones: list[AccionBitacora], desde: datetime, hasta: datetime
    ) -> list[Bitacora]:
        """Todo el período, en orden cronológico (para el CSV)."""
        return list(
            self.db.scalars(
                select(Bitacora)
                .where(
                    Bitacora.accion.in_(acciones),
                    Bitacora.ocurrido_en >= desde,
                    Bitacora.ocurrido_en < hasta,
                )
                .options(selectinload(Bitacora.actor))
                .order_by(Bitacora.ocurrido_en.asc(), Bitacora.id.asc())
            )
        )

    def usuarios(self, ids: set[str]) -> dict[str, Usuario]:
        """Las cuentas sobre las que se hizo cada acción (`entidad_id`), por id en texto."""
        validos = []
        for valor in ids:
            try:
                validos.append(UUID(valor))
            except (TypeError, ValueError):
                continue
        if not validos:
            return {}
        return {
            str(u.id): u for u in self.db.scalars(select(Usuario).where(Usuario.id.in_(validos)))
        }

    def actores(self) -> list[Usuario]:
        """Quienes aparecen como autores en la bitácora (pa el filtro «Usuario»)."""
        return list(
            self.db.scalars(
                select(Usuario)
                .where(
                    Usuario.id.in_(select(Bitacora.actor_id).where(Bitacora.actor_id.is_not(None)))
                )
                .order_by(Usuario.apellido, Usuario.nombre, Usuario.id)
            )
        )
