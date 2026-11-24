"""El stream de eventos de cada usuario (GET /eventos, docs/sse_tiempo_real.md).

Reglas:

- Al abrir (y al reconectar) manda `conectado`: el front lo usa pa volver a pedir todo.
- Reenvía los avisos del canal del usuario tal cual (solo IDs).
- Cada `intervalo` segundos, y cada vez que llega `sesion.cerrada`, revisa si SU sesión
  sigue valiendo. El aviso de cierre va al canal del usuario y puede ser de otra sesión
  suya (otro computador): por eso se comprueba antes de reenviarlo.
- Si la sesión ya no sirve, manda `sesion.cerrada` con el motivo y termina.

La comprobación no renueva la inactividad (RF-U10): un stream abierto no mantiene viva la
sesión. Y no retiene una conexión de la base mientras el stream está abierto.
"""

import asyncio
import json
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from uuid import UUID

from app.adapters.tiempo_real import Broker, mensaje
from app.core.errores import ErrorApi
from app.models import EstadoUsuario, EtapaSesion
from app.services.autenticacion import ServicioAutenticacion

CONECTADO = "conectado"
SESION_CERRADA = "sesion.cerrada"

# Motivos de `sesion.cerrada`. INACTIVIDAD y CUENTA_DESACTIVADA vienen de la guía SSE;
# DEMASIADOS_INTENTOS es el mismo motivo del 401 (cuenta bloqueada estando adentro) y
# CERRADA cubre el resto: cerró sesión en otra pestaña o el admin le restableció la clave.
INACTIVIDAD = "INACTIVIDAD"
CUENTA_DESACTIVADA = "CUENTA_DESACTIVADA"
CERRADA = "CERRADA"
CUENTAS_FUERA = (EstadoUsuario.INACTIVO, EstadoUsuario.ELIMINADO)


@dataclass(frozen=True)
class Comprobacion:
    usuario_id: UUID | None  # None = la sesión ya no sirve
    motivo: str | None = None


def comprobar_sesion(servicio: ServicioAutenticacion, token: str | None) -> Comprobacion:
    """¿Sigue valiendo la sesión del stream? Sin renovar la inactividad."""
    try:
        sesion = servicio.validar_sesion(token, (EtapaSesion.ACTIVA,), pasiva=True)
    except ErrorApi as error:
        if error.estado != 401:
            raise
        motivo = (error.extra or {}).get("motivo")
        if motivo is None:
            estado = servicio.estado_de_la_cuenta(token)
            motivo = CUENTA_DESACTIVADA if estado in CUENTAS_FUERA else CERRADA
        return Comprobacion(None, motivo)
    return Comprobacion(sesion.usuario_id)


Comprobar = Callable[[], Awaitable[Comprobacion]]


async def transmitir(
    broker: Broker, usuario_id: UUID, comprobar: Comprobar, intervalo: float
) -> AsyncIterator[dict[str, str]]:
    """Los eventos SSE de un usuario, ya en el formato de sse-starlette."""
    async with broker.suscribir(usuario_id) as cola:
        yield {"event": CONECTADO, "data": "{}"}
        while True:
            try:
                carga: str | None = await asyncio.wait_for(cola.get(), timeout=intervalo)
            except TimeoutError:
                carga = None
            tipo = json.loads(carga)["tipo"] if carga else None
            if carga is None or tipo == SESION_CERRADA:
                resultado = await comprobar()
                if resultado.usuario_id is None:
                    datos = {"motivo": resultado.motivo or CERRADA}
                    yield {"event": SESION_CERRADA, "data": mensaje(SESION_CERRADA, datos)}
                    return
                continue  # sigue valiendo: era otra sesión del mismo usuario, o un tic
            yield {"event": tipo, "data": carga}
