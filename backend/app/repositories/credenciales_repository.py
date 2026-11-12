"""Historial de envíos de la contraseña temporal (RF-U05 CA 9, RF-U06, RF-DB02 CA 7)."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EnvioCredencial, EstadoEnvio, MotivoCredencial


class RepositorioCredenciales:
    def __init__(self, db: Session) -> None:
        self.db = db

    def registrar(
        self,
        usuario_id: UUID,
        motivo: MotivoCredencial,
        estado: EstadoEnvio,
        codigo_error: str | None,
    ) -> EnvioCredencial:
        envio = EnvioCredencial(
            usuario_id=usuario_id, motivo=motivo, estado=estado, codigo_error=codigo_error
        )
        self.db.add(envio)
        self.db.flush()
        self.db.refresh(envio, ["intentado_en"])
        return envio

    def recientes(self, usuario_id: UUID, cantidad: int = 5) -> list[EnvioCredencial]:
        return list(
            self.db.scalars(
                select(EnvioCredencial)
                .where(EnvioCredencial.usuario_id == usuario_id)
                .order_by(EnvioCredencial.intentado_en.desc(), EnvioCredencial.id.desc())
                .limit(cantidad)
            )
        )
