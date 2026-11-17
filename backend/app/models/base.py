"""La Base de la que heredan TODOS los modelos. Una sola, no declares otra, porfa.

La convención de nombres es pa que Alembic les ponga siempre el mismo nombre a claves,
índices y restricciones (CHECK, UNIQUE, FK). Sin esto, cada migración inventa nombres
y luego no hay quien borre una restricción sin sufrir.
"""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
