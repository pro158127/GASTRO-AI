"""Características del modelo y la fila única de configuración de inferencia."""

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import Caracteristica, ConfiguracionInferencia


class RepositorioCatalogo:
    def __init__(self, db: Session) -> None:
        self.db = db

    def caracteristicas_activas(self) -> list[Caracteristica]:
        return list(
            self.db.scalars(
                select(Caracteristica).where(Caracteristica.activa).order_by(Caracteristica.id)
            )
        )

    def configuracion(self, para_actualizar: bool = False) -> ConfiguracionInferencia | None:
        """La fila id=1 (el CHECK de 0002 no deja otra). FOR UPDATE si se va a cambiar."""
        consulta = (
            select(ConfiguracionInferencia)
            .options(joinedload(ConfiguracionInferencia.actualizador))
            .where(ConfiguracionInferencia.id == 1)
        )
        if para_actualizar:
            consulta = consulta.with_for_update(of=ConfiguracionInferencia)
        return self.db.scalar(consulta)
