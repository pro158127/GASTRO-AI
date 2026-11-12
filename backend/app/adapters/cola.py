"""El enchufe con Celery: la API encola, el worker procesa (PROC-01).

La API no importa las tareas (eso arrastraría OpenCV y compañía a cada petición): manda el
mensaje por nombre con send_task. Si Redis no contesta, se avisa con ErrorCola y el
servicio decide qué hacer con el análisis que quedó a medias.
"""

from typing import Protocol
from uuid import UUID

from celery import Celery

TAREA_PROCESAR_ANALISIS = "gastroia.procesar_analisis"
TAREA_EXPLICAR_ANALISIS = "gastroia.explicar_analisis"  # reintentos de la explicación (ANA-04)


class ErrorCola(Exception):
    """No se pudo encolar. Mensaje genérico; el detalle va en __cause__ y en el log."""


class Cola(Protocol):
    def encolar_analisis(self, analisis_id: UUID) -> None: ...

    def encolar_explicacion(self, analisis_id: UUID) -> None: ...


class ColaCelery:
    def __init__(self, app: Celery) -> None:
        self._app = app

    def encolar_analisis(self, analisis_id: UUID) -> None:
        self._enviar(TAREA_PROCESAR_ANALISIS, analisis_id)

    def encolar_explicacion(self, analisis_id: UUID) -> None:
        self._enviar(TAREA_EXPLICAR_ANALISIS, analisis_id)

    def _enviar(self, tarea: str, analisis_id: UUID) -> None:
        try:
            # retry=False: si Redis está caído preferimos saberlo ya, no a los 30 s
            self._app.send_task(tarea, args=[str(analisis_id)], retry=False)
        except Exception as error:  # kombu tira de todo: OperationalError, ConnectionError…
            raise ErrorCola("No se pudo encolar el análisis.") from error
