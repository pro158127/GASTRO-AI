"""Catálogos de solo lectura: tipos de documento y características del modelo."""

from fastapi import APIRouter

from app.api.deps import Catalogo, SesionActiva
from app.core.seudonimo import LONGITUD_MAXIMA, NOMBRES_TIPO, TipoDocumento
from app.schemas.catalogo import (
    CaracteristicaSalida,
    ListaCaracteristicas,
    ListaTiposDocumento,
    TipoDocumentoSalida,
)
from app.schemas.errores import RespuestaError

router = APIRouter(tags=["catálogos"])

ERRORES = {401: {"model": RespuestaError}}


@router.get("/catalogos/tipos-documento", response_model=ListaTiposDocumento, responses=ERRORES)
def tipos_documento(sesion: SesionActiva):
    """CC, TI y CE con su largo máximo (RF-D01), pa que el front valide igual que el servidor."""
    return ListaTiposDocumento(
        items=[
            TipoDocumentoSalida(
                codigo=t.value, nombre=NOMBRES_TIPO[t], longitud_maxima=LONGITUD_MAXIMA[t]
            )
            for t in TipoDocumento
        ]
    )


@router.get("/caracteristicas", response_model=ListaCaracteristicas, responses=ERRORES)
def caracteristicas(sesion: SesionActiva, catalogo: Catalogo):
    """Lo que clasifica el modelo, con el nombre en español (RF-M01). Doctor y administrador."""
    return ListaCaracteristicas(
        items=[
            CaracteristicaSalida(id=c.id, codigo=c.codigo, nombre=c.nombre)
            for c in catalogo.caracteristicas_activas()
        ]
    )
