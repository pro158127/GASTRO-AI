"""Repositorio: el único que tiene permiso de hablar con PostgreSQL. SQL en otro lado, no."""

from sqlalchemy import text
from sqlalchemy.orm import Session


class HealthRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def ping(self) -> bool:
        return self.db.execute(text("SELECT 1")).scalar_one() == 1
