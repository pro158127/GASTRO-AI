"""El motor de SQLAlchemy y la fábrica de sesiones. Pocas líneas, pero si se rompe se cae todo."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Una sesión por petición, y se cierra pase lo que pase (pa eso el finally).

    Si quitas el finally vas a tener conexiones zombis llenando el pool. Créeme, ya pasó.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
