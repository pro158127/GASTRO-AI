"""Tareas de Celery. Delgaditas a propósito: arman las piezas y le pasan el balón al servicio.

Cada tarea abre su propia sesión de base (el worker no tiene peticiones HTTP) y la cierra
al terminar pase lo que pase.
"""

from uuid import UUID

from sqlalchemy.orm import Session

from app.adapters.almacen import crear_almacen
from app.adapters.cola import TAREA_EXPLICAR_ANALISIS, TAREA_PROCESAR_ANALISIS
from app.adapters.inferencia import crear_inferencia
from app.adapters.llm import crear_adaptador_llm
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.repositories.analisis_repository import RepositorioAnalisis
from app.repositories.catalogo_repository import RepositorioCatalogo
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.services.clasificacion import ServicioClasificacion
from app.services.explicacion import ServicioExplicaciones
from app.services.procesamiento import ServicioProcesamiento
from app.workers.celery_app import celery_app


def _explicaciones(db: Session) -> ServicioExplicaciones:
    ajustes = get_settings()
    return ServicioExplicaciones(
        RepositorioAnalisis(db), crear_adaptador_llm(ajustes), UnidadTrabajo(db), ajustes.llm_modelo
    )


# acks_late: si el worker se muere a la mitad, Redis le devuelve el mensaje a otro.
# Lo que ya terminó no se toca; lo que seguía PROCESANDO se retoma desde el principio.
@celery_app.task(name=TAREA_PROCESAR_ANALISIS, acks_late=True)
def procesar_analisis(analisis_id: str) -> None:
    ajustes = get_settings()
    with SessionLocal() as db:
        almacen = crear_almacen(ajustes)
        analisis, catalogo, unidad = (
            RepositorioAnalisis(db),
            RepositorioCatalogo(db),
            UnidadTrabajo(db),
        )
        codigos = tuple(c.codigo for c in catalogo.caracteristicas_activas())
        clasificador = ServicioClasificacion(
            crear_inferencia(ajustes, codigos), almacen, analisis, catalogo, unidad
        )
        ServicioProcesamiento(analisis, almacen, unidad, clasificador).procesar(UUID(analisis_id))
        # El resultado ya quedó guardado; ahora sí la explicación (RF-R05 CA 3). Si el
        # mensaje llega repetido, generar() solo actúa si sigue PENDIENTE.
        _explicaciones(db).generar(UUID(analisis_id))


@celery_app.task(name=TAREA_EXPLICAR_ANALISIS, acks_late=True)
def explicar_analisis(analisis_id: str) -> None:
    with SessionLocal() as db:
        _explicaciones(db).generar(UUID(analisis_id))
