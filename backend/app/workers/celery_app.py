"""Celery: el que chambea en segundo plano mientras la API ya le contestó 202 al front.

Aquí van a vivir las tareas pesadas (llamar al Space de Hugging Face, pedirle la
explicación a Gemini). En Windows córrelo con --pool=solo o se pone de malas.
"""

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "gastroia",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tareas"],  # en español, así que autodiscover (busca tasks.py) no sirve
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    task_track_started=True,
    # La API espera máximo 3 s a Redis al encolar; después responde 503 en vez de colgarse
    broker_connection_timeout=3,
    # Un análisis a la vez por proceso: son pesados y así acks_late reparte parejo
    worker_prefetch_multiplier=1,
)
