"""Celery: el que chambea en segundo plano mientras la API ya le contestó 202 al front.

Aquí van a vivir las tareas pesadas (llamar al Space de Hugging Face, pedirle la
explicación a Gemini). En Windows córrelo con --pool=solo o se pone de malas.
"""

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery("gastroia", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    task_track_started=True,
)
celery_app.autodiscover_tasks(["app.workers"])
