"""Controlador del stream de eventos en tiempo real (SSE, docs/sse_tiempo_real.md §2)."""

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from sse_starlette import EventSourceResponse

from app.api.deps import COOKIE_SESION, Ajustes, BrokerEventos, VerificadorDelStream
from app.schemas.errores import RespuestaError
from app.services.eventos import transmitir

router = APIRouter(tags=["eventos"])


@router.get(
    "/eventos",
    response_class=EventSourceResponse,
    responses={
        200: {"content": {"text/event-stream": {}}, "description": "Stream de eventos"},
        401: {"model": RespuestaError},
        403: {"model": RespuestaError},
    },
)
async def eventos(
    request: Request, broker: BrokerEventos, verificador: VerificadorDelStream, ajustes: Ajustes
):
    """Avisos del servidor pa el usuario de la sesión: `conectado`, `analisis.estado`,
    `analisis.explicacion`, `traslado.nuevo`, `cuenta.rol_cambiado` y `sesion.cerrada`.

    Solo llevan IDs; el front vuelve a pedir el dato al endpoint REST. No renueva la
    inactividad de la sesión (RF-U10) y se corta con `sesion.cerrada` cuando ya no vale.
    """
    token = request.cookies.get(COOKIE_SESION)
    # 401 / 403 como cualquier endpoint protegido, antes de abrir el stream
    usuario_id = await run_in_threadpool(verificador.abrir, token)

    async def comprobar():
        return await run_in_threadpool(verificador.comprobar, token)

    return EventSourceResponse(
        transmitir(broker, usuario_id, comprobar, ajustes.eventos_intervalo_segundos),
        headers={"X-Accel-Buffering": "no"},  # que nginx no acumule los eventos
    )
