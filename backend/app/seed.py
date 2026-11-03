import time

from sqlalchemy import text

from app.adapters.minio_adapter import minio_adapter
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import Role, User
from app.security import hash_password

DEFAULT_ROLES = ["admin", "doctor", "tecnico"]


def wait_for_db(retries: int = 30, delay: float = 2.0) -> None:
    for _ in range(retries):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except Exception:
            time.sleep(delay)
    raise RuntimeError("PostgreSQL no disponible tras varios intentos")


def wait_for_minio(retries: int = 30, delay: float = 2.0) -> None:
    for _ in range(retries):
        try:
            minio_adapter.ensure_bucket()
            return
        except Exception:
            time.sleep(delay)
    raise RuntimeError("MinIO no disponible tras varios intentos")


def seed() -> None:
    wait_for_db()
    Base.metadata.create_all(bind=engine)
    wait_for_minio()

    with SessionLocal() as db:
        roles = {role.name: role for role in db.query(Role).all()}
        for name in DEFAULT_ROLES:
            if name not in roles:
                roles[name] = Role(name=name)
                db.add(roles[name])
        db.flush()

        existing = db.query(User).filter(User.email == settings.superadmin_email).first()
        if existing is None:
            admin_role = roles["admin"]
            db.add(
                User(
                    email=settings.superadmin_email,
                    full_name="Super Administrador",
                    password_hash=hash_password(settings.superadmin_password),
                    role_id=admin_role.id,
                    is_active=True,
                )
            )

        db.commit()

    print("Seed completado: roles y superadmin creados.")


if __name__ == "__main__":
    seed()
