"""Unidad de trabajo: el servicio decide CUÁNDO se confirma, sin saber que hay SQLAlchemy.

Hace falta porque hay casos en que el cambio debe quedar guardado aunque la respuesta sea
un error. Ejemplo: un intento fallido de login sube el contador y va a la bitácora, y
LUEGO se responde 401. Si no se confirma antes, la excepción deshace todo y el bloqueo
por intentos (RNF-03) nunca llegaría.
"""

from sqlalchemy.orm import Session


class UnidadTrabajo:
    def __init__(self, db: Session) -> None:
        self.db = db

    def confirmar(self) -> None:
        self.db.commit()

    def descartar(self) -> None:
        self.db.rollback()
