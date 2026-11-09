"""Tareas de Celery. Delgaditas a propósito: arman las piezas y le pasan el balón al servicio.

Cada tarea abre su propia sesión de base (el worker no tiene peticiones HTTP) y la cierra
al terminar pase lo que pase.
"""

from uuid import UUID

from app.adapters.almacen import crear_almacen
from app.adapters.cola import TAREA_PROCESAR_ANALISIS
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.repositories.analisis_repository import RepositorioAnalisis
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.services.procesamiento import ServicioProcesamiento
from app.workers.celery_app import celery_app


# acks_late: si el worker se muere a la mitad, Redis le devuelve el mensaje a otro.
# No pasa nada por repetir: procesar() ignora lo que ya no está PROCESANDO.
@celery_app.task(name=TAREA_PROCESAR_ANALISIS, acks_late=True)
def procesar_analisis(analisis_id: str) -> None:
    with SessionLocal() as db:
        ServicioProcesamiento(
            RepositorioAnalisis(db), crear_almacen(get_settings()), UnidadTrabajo(db)
        ).procesar(UUID(analisis_id))
