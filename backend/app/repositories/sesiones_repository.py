"""Sesiones: en la base solo vive el hash SHA-256 del token, nunca el token."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session, joinedload

from app.models import EtapaSesion, Sesion, Usuario


class RepositorioSesiones:
    def __init__(self, db: Session) -> None:
        self.db = db

    def crear(
        self, usuario_id: UUID, etapa: EtapaSesion, token_hash: str, ip: str | None
    ) -> Sesion:
        sesion = Sesion(usuario_id=usuario_id, etapa=etapa, token_hash=token_hash, ip=ip)
        self.db.add(sesion)
        self.db.flush()
        return sesion

    def cerrar_todas(self, usuario_id: UUID, cuando: datetime) -> int:
        """Cierra las sesiones abiertas de un usuario (desactivar, eliminar, restablecer…)."""
        resultado = self.db.execute(
            update(Sesion)
            .where(Sesion.usuario_id == usuario_id, Sesion.cerrada_en.is_(None))
            .values(cerrada_en=cuando)
        )
        return resultado.rowcount or 0

    def por_token_hash(self, token_hash: str) -> Sesion | None:
        # Una sola consulta trae sesión, usuario y rol: el rol sale fresco de la base (RF-U03)
        return self.db.scalar(
            select(Sesion)
            .options(joinedload(Sesion.usuario).joinedload(Usuario.rol))
            .where(Sesion.token_hash == token_hash)
        )
