import base64
import json
import time
import uuid

import redis

from app.adapters.llm_adapter import llm_adapter
from app.adapters.minio_adapter import minio_adapter
from app.config import settings
from app.db import SessionLocal
from app.models import Analisis
from app.worker import celery_app

# 1x1 transparent PNG used as a Grad-CAM placeholder for the scaffold.
PLACEHOLDER_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
)


def _publish(analisis_id: str, payload: dict) -> None:
    client = redis.from_url(settings.redis_url)
    try:
        client.publish(f"analisis:{analisis_id}", json.dumps(payload))
    finally:
        client.close()


@celery_app.task(name="procesar_analisis")
def procesar_analisis(analisis_id: str) -> dict:
    try:
        # Simulated inference against the (private) Hugging Face Space.
        # Replace with the real HTTPS call using settings.huggingface_token.
        time.sleep(3)

        resultado = {
            "clases": ["lesion_a", "lesion_b"],
            "probabilidades": {"lesion_a": 0.87, "lesion_b": 0.12},
            "confianza_global": 0.87,
            "roi": {"x": 120, "y": 90, "w": 180, "h": 180},
        }

        grad_cam_key = f"gradcam/{analisis_id}.png"
        minio_adapter.put_bytes(grad_cam_key, PLACEHOLDER_PNG, "image/png")

        explicacion = llm_adapter.generar_explicacion(resultado)

        with SessionLocal() as db:
            analisis = (
                db.query(Analisis)
                .filter(Analisis.id == uuid.UUID(analisis_id))
                .first()
            )
            if analisis is None:
                return {"estado": "NO_ENCONTRADO"}
            analisis.estado = "COMPLETADO"
            analisis.resultado = resultado
            analisis.explicacion = explicacion
            analisis.grad_cam_key = grad_cam_key
            db.commit()

        _publish(
            analisis_id,
            {
                "id": analisis_id,
                "estado": "COMPLETADO",
                "explicacion": explicacion,
            },
        )
        return {"estado": "COMPLETADO"}
    except Exception as exc:  # noqa: BLE001
        with SessionLocal() as db:
            analisis = (
                db.query(Analisis)
                .filter(Analisis.id == uuid.UUID(analisis_id))
                .first()
            )
            if analisis is not None:
                analisis.estado = "FALLIDO"
                analisis.error = str(exc)
                db.commit()
        _publish(analisis_id, {"id": analisis_id, "estado": "FALLIDO"})
        raise
