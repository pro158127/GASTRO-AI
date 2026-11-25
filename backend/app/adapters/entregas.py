"""Cuántas veces le ha llegado al worker el mismo análisis (PROC-01).

Con `task_reject_on_worker_lost`, si el proceso muere a la mitad, Redis vuelve a entregar
el mensaje. Este contador pone el tope: una imagen que tumbe el worker siempre no lo deja
dando vueltas para siempre. Vive en Redis (el mismo del broker) con vencimiento, porque solo
importa mientras el mensaje anda circulando.
"""

from typing import Protocol
from uuid import UUID

import redis

# Un día: de sobra para las reentregas (cada una a los 5 min del visibility_timeout)
VENCIMIENTO_SEGUNDOS = 24 * 60 * 60


class ContadorEntregas(Protocol):
    def sumar(self, analisis_id: UUID) -> int:
        """Anota una entrega más y devuelve cuántas van (la primera es 1)."""
        ...

    def olvidar(self, analisis_id: UUID) -> None:
        """La tarea terminó (bien o mal): el próximo reintento del doctor empieza en 1."""
        ...


def _clave(analisis_id: UUID) -> str:
    return f"entregas:analisis:{analisis_id}"


class ContadorEntregasRedis:
    def __init__(self, cliente: redis.Redis) -> None:
        self._cliente = cliente

    @classmethod
    def desde_url(cls, url: str) -> "ContadorEntregasRedis":
        return cls(redis.Redis.from_url(url))

    def sumar(self, analisis_id: UUID) -> int:
        clave = _clave(analisis_id)
        # INCR y EXPIRE juntos: si el worker muere entre los dos, la clave no queda eterna
        with self._cliente.pipeline() as tubo:
            tubo.incr(clave)
            tubo.expire(clave, VENCIMIENTO_SEGUNDOS)
            entregas, _ = tubo.execute()
        return int(entregas)

    def olvidar(self, analisis_id: UUID) -> None:
        self._cliente.delete(_clave(analisis_id))
