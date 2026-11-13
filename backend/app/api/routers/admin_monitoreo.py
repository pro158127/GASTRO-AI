"""Controlador de salud del sistema (W-22, W-23, W-24): solo ADMINISTRADOR y nada clínico.

- Estado operativo y modelo desplegado (RF-A04, RNF-29).
- Métricas del reporte de evaluación del modelo (RF-A05, RNF-14, RNF-15).
- Logs técnicos de inferencia (RF-M03).
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import ServicioDeEstadoOperativo, ServicioDeMonitoreo, SesionAdmin
from app.models import EstadoInferencia, NombreMetrica
from app.repositories.monitoreo_repository import FiltroLogs
from app.schemas.errores import RespuestaError
from app.schemas.monitoreo import (
    AlertaEstado,
    CaracteristicaMetrica,
    LogTecnico,
    Metricas,
    MetricasCaracteristica,
    ModeloDesplegadoInfo,
    ModeloMetricas,
    PaginaLogs,
    RespuestaEstadoOperativo,
    RespuestaMetricas,
    ServicioEstado,
)
from app.schemas.paginacion import POR_PAGINA_MAXIMO, Paginacion
from app.services.estado_operativo import EstadoOperativo
from app.services.historial import limites_de_fechas
from app.services.monitoreo import ROTULO_METRICAS, MetricasDe

router = APIRouter(prefix="/admin", tags=["salud del sistema"])

ERRORES = {code: {"model": RespuestaError} for code in (401, 403, 422)}


def _estado(e: EstadoOperativo) -> RespuestaEstadoOperativo:
    m = e.modelo_desplegado
    return RespuestaEstadoOperativo(
        verificado_en=e.verificado_en,
        alerta=AlertaEstado(nivel=e.alerta.nivel, mensaje=e.alerta.mensaje) if e.alerta else None,
        servicios=[
            ServicioEstado(
                codigo=s.codigo,
                nombre=s.nombre,
                estado=s.estado,
                tiempo_respuesta_ms=s.tiempo_respuesta_ms,
                ultima_verificacion=s.ultima_verificacion,
            )
            for s in e.servicios
        ],
        modelo_desplegado=ModeloDesplegadoInfo(
            repositorio_hf=m.repositorio_hf,
            revision_sha=m.revision_sha,
            huella_pesos_sha256=m.huella_pesos_sha256,
            desplegado_en=m.desplegado_en,
            model_card_url=m.model_card_url,
            coincide_con_configuracion=m.coincide_con_configuracion,
            revision_space=m.revision_space,
        )
        if m
        else None,
    )


@router.get("/estado-operativo", response_model=RespuestaEstadoOperativo, responses=ERRORES)
def estado_operativo(sesion: SesionAdmin, servicio: ServicioDeEstadoOperativo):
    """Estado de cada servicio y del modelo desplegado (W-22, RF-A04 CA 1 a 4).

    Se mide en vivo, con un máximo de 3 s por servicio; la medición se reutiliza 30 s.
    """
    return _estado(servicio.consultar())


@router.post(
    "/estado-operativo/verificar", response_model=RespuestaEstadoOperativo, responses=ERRORES
)
def verificar_estado(sesion: SesionAdmin, servicio: ServicioDeEstadoOperativo):
    """Botón «Actualizar»: mide de nuevo (si la última medición tiene más de 10 s)."""
    return _estado(servicio.consultar(forzar=True))


def _metricas(valores: MetricasDe) -> dict:
    return {m.value: valores.valores.get(m) for m in NombreMetrica}


@router.get(
    "/modelo/metricas",
    response_model=RespuestaMetricas,
    response_model_exclude_unset=True,
    responses=ERRORES,
)
def metricas_modelo(sesion: SesionAdmin, servicio: ServicioDeMonitoreo):
    """Métricas del reporte de evaluación del modelo vigente (W-23, RF-A05).

    Son de la evaluación sobre el conjunto de prueba, no del desempeño en producción.
    Sin reporte: `{"disponible": false}` (W-23b), sin cifras provisionales.
    """
    r = servicio.metricas()
    modelo = (
        ModeloMetricas(repositorio_hf=r.modelo.repositorio_hf, revision_sha=r.modelo.revision_sha)
        if r.modelo
        else None
    )
    if not r.disponible:
        return (
            RespuestaMetricas(disponible=False, modelo=modelo)
            if modelo
            else RespuestaMetricas(disponible=False)
        )
    return RespuestaMetricas(
        disponible=True,
        modelo=modelo,
        rotulo=ROTULO_METRICAS,
        conjunto_prueba=r.conjunto_prueba,
        fecha_reporte=r.fecha_reporte,
        contiene_datos_clinicos=False,  # RF-A05 CA 2
        model_card_url=r.modelo.model_card_url,
        macro=Metricas(**_metricas(r.macro)),
        por_caracteristica=[
            MetricasCaracteristica(
                caracteristica=CaracteristicaMetrica(id=c.caracteristica_id, nombre=c.nombre),
                **_metricas(c.metricas),
            )
            for c in r.por_caracteristica
        ],
    )


@router.get("/logs-inferencia", response_model=PaginaLogs, responses=ERRORES)
def logs_inferencia(
    sesion: SesionAdmin,
    servicio: ServicioDeMonitoreo,
    estado: EstadoInferencia | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    pagina: Annotated[int, Query(ge=1)] = 1,
    por_pagina: Annotated[int, Query(ge=1, le=POR_PAGINA_MAXIMO)] = 25,
):
    """Logs técnicos de inferencia (W-24, RF-M03): tiempos y estado, sin ningún dato clínico.

    `desde` y `hasta` son días de Colombia, ambos incluidos.
    """
    inicio, fin = limites_de_fechas(desde, hasta)
    filas, total = servicio.logs(
        FiltroLogs(estado=estado, desde=inicio, hasta=fin, pagina=pagina, por_pagina=por_pagina)
    )
    return PaginaLogs(
        items=[
            LogTecnico(
                id=f"L-{f.id:06d}",
                ocurrido_en=f.ocurrido_en,
                revision_modelo=f.revision_modelo[:7],
                latencia_vision_ms=f.latencia_vision_ms,
                latencia_llm_ms=f.latencia_llm_ms,
                estado=f.estado,
                codigo_error=f.codigo_error,
            )
            for f in filas
        ],
        paginacion=Paginacion(pagina=pagina, por_pagina=por_pagina, total=total),
    )
