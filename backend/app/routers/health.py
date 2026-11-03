from fastapi import APIRouter
from sqlalchemy import text

from app.adapters.minio_adapter import minio_adapter
from app.db import SessionLocal

router = APIRouter()


@router.get("/health")
def health():
    database_ok = True
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:
        database_ok = False

    minio_ok = minio_adapter.ping()

    return {
        "status": "ok" if (database_ok and minio_ok) else "degraded",
        "database": database_ok,
        "minio": minio_ok,
    }
