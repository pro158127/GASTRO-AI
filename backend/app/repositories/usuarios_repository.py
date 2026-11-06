"""Consultas de usuarios. El rol siempre viene cargado: se lee de la base en cada petición."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session, joinedload

from app.models import Usuario


class RepositorioUsuarios:
    def __init__(self, db: Session) -> None:
        self.db = db

    def por_correo(self, correo: str) -> Usuario | None:
        return self.db.scalar(
            select(Usuario).options(joinedload(Usuario.rol)).where(Usuario.correo == correo)
        )

    def por_id(self, usuario_id: UUID) -> Usuario | None:
        return self.db.scalar(
            select(Usuario).options(joinedload(Usuario.rol)).where(Usuario.id == usuario_id)
        )

    def sumar_intento_fallido(self, usuario_id: UUID) -> int:
        """+1 al contador de un tirón en la base (UPDATE … RETURNING).

        Atómico a propósito: dos intentos al mismo tiempo no se pisan el conteo, que es
        justo lo que haría un ataque de fuerza bruta en paralelo.
        """
        intentos = self.db.scalar(
            update(Usuario)
            .where(Usuario.id == usuario_id)
            .values(intentos_fallidos=Usuario.intentos_fallidos + 1)
            .returning(Usuario.intentos_fallidos)
        )
        return int(intentos or 0)

    def bloquear(self, usuario_id: UUID, hasta: datetime) -> None:
        self.db.execute(
            update(Usuario)
            .where(Usuario.id == usuario_id)
            .values(intentos_fallidos=0, bloqueado_hasta=hasta)
        )
