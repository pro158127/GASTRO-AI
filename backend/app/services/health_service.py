"""Servicio: aquí van las reglas del negocio, sin tener ni idea de dónde viven los datos.

Por eso recibe el repositorio por el constructor: en las pruebas le pasamos uno falso y
ni hace falta levantar PostgreSQL (RNF-19).
"""

from typing import Protocol


class DatabaseChecker(Protocol):
    def ping(self) -> bool: ...


class HealthService:
    def __init__(self, repository: DatabaseChecker) -> None:
        self.repository = repository

    def check(self) -> dict[str, str]:
        try:
            database = "ok" if self.repository.ping() else "error"
        except Exception:
            database = "error"
        status = "ok" if database == "ok" else "degraded"
        return {"status": status, "database": database}
