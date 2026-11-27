"""Celery: el que chambea en segundo plano mientras la API ya le contestó 202 al front.

Aquí van a vivir las tareas pesadas (llamar al Space de Hugging Face, pedirle la
explicación a Gemini). En Windows córrelo con --pool=solo o se pone de malas.
"""

from celery import Celery
from celery.signals import worker_init

from app.adapters.tiempo_real import PublicadorRedis
from app.core.config import get_settings
from app.repositories import avisos_tiempo_real

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
    # Si el proceso hijo muere (OOM, kill, límite duro), el mensaje vuelve a la cola en vez
    # de quedar como FAILURE con el análisis en PROCESANDO. El tope de reentregas lo pone
    # ServicioProcesamiento (MAX_ENTREGAS) con el contador de adapters/entregas.py.
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Space 30 s + Gemini 15 s + MinIO: 120 s sobran. El límite duro mata el proceso y cuenta
    # como una entrega perdida. Ojo: con --pool=solo (Windows) Celery no aplica los límites.
    task_soft_time_limit=120,
    task_time_limit=150,
    # Si se cae el worker completo, el mensaje sin confirmar vuelve a los 5 min (no a la
    # hora que trae Redis por defecto). Debe ser mayor que task_time_limit.
    broker_transport_options={"visibility_timeout": 300},
)


@worker_init.connect
def _avisos_en_tiempo_real(**_kwargs) -> None:
    # Etapas, fin del análisis y explicación salen al front por Redis (SSE)
    avisos_tiempo_real.instalar(PublicadorRedis(settings.redis_url))
