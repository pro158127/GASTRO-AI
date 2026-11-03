import uuid
from typing import Optional

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.adapters.minio_adapter import minio_adapter
from app.models import Analisis
from app.schemas.analisis import AnalisisOut
from app.tasks import procesar_analisis


class AnalisisService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def crear_analisis(
        self, file: UploadFile, documento: str, tipo_documento: str
    ) -> AnalisisOut:
        data = file.file.read()
        ext = "bin"
        if file.filename and "." in file.filename:
            ext = file.filename.rsplit(".", 1)[-1].lower()

        object_key = f"original/{uuid.uuid4()}.{ext}"
        minio_adapter.put_bytes(
            object_key, data, file.content_type or "application/octet-stream"
        )

        analisis = Analisis(
            documento=documento,
            tipo_documento=tipo_documento,
            estado="PROCESANDO",
            imagen_key=object_key,
        )
        self.db.add(analisis)
        self.db.commit()
        self.db.refresh(analisis)

        procesar_analisis.delay(str(analisis.id))

        return self._to_out(analisis)

    def obtener_analisis(self, analisis_id: str) -> Optional[AnalisisOut]:
        try:
            analisis_id_uuid = uuid.UUID(analisis_id)
        except ValueError:
            return None
        analisis = (
            self.db.query(Analisis).filter(Analisis.id == analisis_id_uuid).first()
        )
        if analisis is None:
            return None
        return self._to_out(analisis)

    def _to_out(self, analisis: Analisis) -> AnalisisOut:
        return AnalisisOut(
            id=analisis.id,
            documento=analisis.documento,
            tipo_documento=analisis.tipo_documento,
            estado=analisis.estado,
            resultado=analisis.resultado,
            explicacion=analisis.explicacion,
            error=analisis.error,
            imagen_url=(
                minio_adapter.presigned_get(analisis.imagen_key)
                if analisis.imagen_key
                else None
            ),
            grad_cam_url=(
                minio_adapter.presigned_get(analisis.grad_cam_key)
                if analisis.grad_cam_key
                else None
            ),
            created_at=analisis.created_at,
            updated_at=analisis.updated_at,
        )
