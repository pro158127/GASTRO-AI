"""Repositorio de la bitácora: solo inserta. No hay update ni delete, ni aquí ni en la base."""

from sqlalchemy.orm import Session

from app.models import Bitacora
from app.services.auditoria import EventoAuditoria


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
