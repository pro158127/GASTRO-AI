"""Tiempo real con SSE (docs/sse_tiempo_real.md): publicar avisos y repartirlos por Redis.

- `PublicadorRedis`: lo usan la API y el worker de Celery (código síncrono) para mandar un
  aviso al canal `usuario:<id>`. Si Redis no responde, el aviso se pierde y punto: el front
  vuelve a pedir los datos al reconectar, y una petición nunca falla por esto.
- `Broker`: vive en cada proceso de la API. Un solo suscriptor de Redis por proceso, que
  reparte cada mensaje a las conexiones SSE abiertas de ese usuario con colas en memoria.

Los avisos llevan solo IDs (nunca datos clínicos ni el documento del paciente, RNF-04): el
front vuelve a pedir el dato al endpoint REST de siempre, que es donde está la autorización.
"""

import asyncio
import contextlib
import json
import logging
from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Protocol
from uuid import UUID

import redis
import redis.asyncio as redis_async

log = logging.getLogger(__name__)

PREFIJO_CANAL = "usuario:"
MAXIMO_EN_COLA = 100  # por conexión; si un cliente se atrasa tanto, se le descartan avisos


def canal(usuario_id: UUID | str) -> str:
    return f"{PREFIJO_CANAL}{usuario_id}"


def mensaje(tipo: str, datos: dict[str, str] | None = None) -> str:
    return json.dumps({"tipo": tipo, **(datos or {})})


class PublicadorTiempoReal(Protocol):
    def publicar(self, usuario_id: UUID, tipo: str, datos: dict[str, str]) -> None: ...


class PublicadorRedis:
    def __init__(self, url: str) -> None:
        # El cliente abre la conexión al primer uso y la recupera solo si se cae
        self._redis = redis.Redis.from_url(url, socket_timeout=2, socket_connect_timeout=2)

    def publicar(self, usuario_id: UUID, tipo: str, datos: dict[str, str]) -> None:
        try:
            self._redis.publish(canal(usuario_id), mensaje(tipo, datos))
        except redis.RedisError:
            # Sin ids en el log: el tipo basta pa saber qué se perdió
            log.warning("No se pudo publicar el aviso %s en Redis", tipo)


class Broker:
    """Reparte los avisos a las conexiones SSE de este proceso.

    Con `url` escucha Redis (`usuario:*`) desde la primera suscripción; sin `url` solo
    entrega lo que se le pase con `entregar` (pruebas y desarrollo de un solo proceso).
    """

    def __init__(self, url: str | None = None) -> None:
        self._url = url
        self._tarea: asyncio.Task | None = None
        self._suscriptores: dict[str, set[asyncio.Queue[str]]] = defaultdict(set)

    @contextlib.asynccontextmanager
    async def suscribir(self, usuario_id: UUID | str) -> AsyncIterator[asyncio.Queue[str]]:
        self._arrancar()
        clave = str(usuario_id)
        cola: asyncio.Queue[str] = asyncio.Queue(maxsize=MAXIMO_EN_COLA)
        self._suscriptores[clave].add(cola)
        try:
            yield cola
        finally:
            self._suscriptores[clave].discard(cola)
            if not self._suscriptores[clave]:
                del self._suscriptores[clave]

    def entregar(self, usuario_id: UUID | str, carga: str) -> None:
        for cola in list(self._suscriptores.get(str(usuario_id), ())):
            try:
                cola.put_nowait(carga)
            except asyncio.QueueFull:
                pass  # cliente lento: lo recupera con el refetch al reconectar

    def conexiones(self, usuario_id: UUID | str) -> int:
        return len(self._suscriptores.get(str(usuario_id), ()))

    async def detener(self) -> None:
        if self._tarea:
            self._tarea.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._tarea
            self._tarea = None

    def _arrancar(self) -> None:
        # Se arranca aquí y no al importar: tiene que correr dentro del event loop
        if self._url and (self._tarea is None or self._tarea.done()):
            self._tarea = asyncio.create_task(self._escuchar())

    async def _escuchar(self) -> None:
        while True:
            cliente = redis_async.Redis.from_url(self._url, decode_responses=True)
            try:
                async with cliente.pubsub() as pubsub:
                    await pubsub.psubscribe(f"{PREFIJO_CANAL}*")
                    async for msg in pubsub.listen():
                        if msg["type"] == "pmessage":
                            self.entregar(msg["channel"].removeprefix(PREFIJO_CANAL), msg["data"])
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001  Redis caído: se reintenta sin tumbar la API
                log.warning("Se perdió la conexión con Redis para los eventos; reintentando")
                await asyncio.sleep(2)
            finally:
                await cliente.aclose()
