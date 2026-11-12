"""Controlador de la bitácora (W-21, RF-A02, RNF-05): solo ADMINISTRADOR y solo lectura.

No hay POST, PUT ni DELETE sobre la bitácora: la base de datos además lo impide (triggers).
"""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.api.deps import IpCliente, ServicioDeBitacora, SesionAdmin
from app.models import AccionBitacora, EstadoUsuario, ResultadoAccion, Usuario
from app.repositories.bitacora_repository import FiltroBitacora
from app.schemas.bitacora import (
    AccionFiltro,
    EntradaBitacora,
    FiltrosBitacora,
    PaginaBitacora,
    PersonaBitacora,
    UsuarioFiltro,
)
from app.schemas.errores import RespuestaError
from app.schemas.paginacion import POR_PAGINA_MAXIMO, Paginacion
from app.services.bitacora import TEXTO_ACCION, detalle_legible
from app.services.historial import limites_de_fechas

router = APIRouter(prefix="/admin", tags=["bitácora"])

ERRORES = {code: {"model": RespuestaError} for code in (401, 403, 422)}


def _persona(u: Usuario | None) -> PersonaBitacora | None:
    if u is None:
        return None
    return PersonaBitacora(
        id=u.id,
        nombre=u.nombre,
        apellido=u.apellido,
        cuenta_eliminada=u.estado is EstadoUsuario.ELIMINADO,
    )


@router.get("/bitacora", response_model=PaginaBitacora, responses=ERRORES)
def consultar(
    sesion: SesionAdmin,
    servicio: ServicioDeBitacora,
    pagina: Annotated[int, Query(ge=1)] = 1,
    por_pagina: Annotated[int, Query(ge=1, le=POR_PAGINA_MAXIMO)] = 25,
    accion: AccionBitacora | None = None,
    resultado: ResultadoAccion | None = None,
    actor_id: UUID | None = None,
    actor: Annotated[str | None, Query(max_length=100)] = None,
    desde: date | None = None,
    hasta: date | None = None,
):
    """Bitácora paginada, lo más reciente primero (W-21).

    Filtros: `accion`, `resultado` (EXITO o FALLO), `actor_id` o `actor` (parte del nombre),
    `desde` y `hasta` (días de Colombia, ambos incluidos). `actor` es null en intentos sin sesión.
    """
    inicio, fin = limites_de_fechas(desde, hasta)
    filtro = FiltroBitacora(
        pagina=pagina,
        por_pagina=por_pagina,
        accion=accion,
        resultado=resultado,
        actor_id=actor_id,
        actor_texto=actor.strip() if actor and actor.strip() else None,
        desde=inicio,
        hasta=fin,
    )
    resultado_pagina = servicio.consultar(filtro)
    usuarios = resultado_pagina.usuarios
    return PaginaBitacora(
        items=[
            EntradaBitacora(
                id=str(e.id),
                ocurrido_en=e.ocurrido_en,
                actor=_persona(e.actor),
                accion=e.accion.value,
                accion_texto=TEXTO_ACCION.get(e.accion, e.accion.value),
                resultado=e.resultado.value,
                objetivo=_persona(usuarios.get(e.entidad_id))
                if e.entidad == "Usuario" and e.entidad_id
                else None,
                detalle=detalle_legible(e, usuarios),
                ip=e.ip,
            )
            for e in resultado_pagina.entradas
        ],
        paginacion=Paginacion(pagina=pagina, por_pagina=por_pagina, total=resultado_pagina.total),
    )


@router.get("/bitacora/filtros", response_model=FiltrosBitacora, responses=ERRORES)
def filtros(sesion: SesionAdmin, servicio: ServicioDeBitacora):
    """Opciones de los filtros de W-21: todas las acciones y quienes aparecen como autores."""
    return FiltrosBitacora(
        acciones=[AccionFiltro(codigo=a.value, texto=t) for a, t in TEXTO_ACCION.items()],
        usuarios=[
            UsuarioFiltro(
                id=u.id,
                nombre=f"{u.nombre} {u.apellido}",
                cuenta_eliminada=u.estado is EstadoUsuario.ELIMINADO,
            )
            for u in servicio.actores()
        ],
    )


@router.get(
    "/auditoria/exportar",
    responses={
        **ERRORES,
        200: {"content": {"text/csv": {}}, "description": "CSV de la auditoría"},
    },
)
def exportar(
    sesion: SesionAdmin,
    servicio: ServicioDeBitacora,
    ip: IpCliente,
    desde: date | None = None,
    hasta: date | None = None,
):
    """CSV de la auditoría de creación de cuentas y del segundo factor (RF-DB02 CA 7 y 10).

    Columnas: fecha_hora, usuario, evento, resultado, ip. Período obligatorio, de máximo 366
    días (422 PERIODO_INVALIDO). La exportación queda registrada en la bitácora.
    """
    nombre, contenido = servicio.exportar(sesion.usuario, ip, desde, hasta)
    return Response(
        content=contenido,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )
