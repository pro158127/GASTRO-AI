"""Controlador de /admin/configuracion-inferencia: umbrales de decisión (RF-A01, solo admin)."""

from fastapi import APIRouter

from app.api.deps import IpCliente, ServicioConfiguracion, SesionAdmin
from app.schemas.catalogo import (
    ConfiguracionEntrada,
    ConfiguracionSalida,
    Persona,
    UmbralCaracteristica,
)
from app.schemas.errores import RespuestaError
from app.services.configuracion_inferencia import (
    CambioUmbral,
    NuevaConfiguracion,
    VistaConfiguracion,
)

router = APIRouter(prefix="/admin/configuracion-inferencia", tags=["configuración de inferencia"])

ERRORES = {code: {"model": RespuestaError} for code in (401, 403, 422)}


def _salida(vista: VistaConfiguracion) -> ConfiguracionSalida:
    config, quien = vista.configuracion, vista.configuracion.actualizador
    return ConfiguracionSalida(
        usar_umbral_por_caracteristica=config.usar_umbral_por_caracteristica,
        umbral_global=config.umbral_global,
        caracteristicas=[
            UmbralCaracteristica(
                id=c.id,
                codigo=c.codigo,
                nombre=c.nombre,
                umbral=c.umbral,
                umbral_por_defecto=c.umbral_por_defecto,
                activa=c.activa,
            )
            for c in vista.caracteristicas
        ],
        actualizado_por=Persona(nombre=quien.nombre, apellido=quien.apellido) if quien else None,
        actualizado_en=config.actualizado_en,
    )


@router.get("", response_model=ConfiguracionSalida, responses=ERRORES)
def ver(sesion: SesionAdmin, servicio: ServicioConfiguracion):
    """Modo (global o por característica), umbral global y el de cada característica, con el
    valor por defecto de la model card."""
    return _salida(servicio.ver())


@router.put("", response_model=ConfiguracionSalida, responses=ERRORES)
def actualizar(
    entrada: ConfiguracionEntrada,
    sesion: SesionAdmin,
    servicio: ServicioConfiguracion,
    ip: IpCliente,
):
    """Cambia los umbrales (10 % a 90 %). Solo afecta análisis futuros (RF-A01 CA 2).

    En modo por característica deben venir todas las activas. El diálogo de confirmación
    (W-26c, RNF-08) es del front.
    """
    nueva = NuevaConfiguracion(
        usar_umbral_por_caracteristica=entrada.usar_umbral_por_caracteristica,
        umbral_global=entrada.umbral_global,
        umbrales=[CambioUmbral(u.caracteristica_id, u.umbral) for u in entrada.umbrales],
    )
    return _salida(servicio.actualizar(nueva, sesion.usuario, ip))
