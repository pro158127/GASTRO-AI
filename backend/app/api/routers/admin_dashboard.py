"""Controlador del dashboard técnico (W-19, RF-DB02): solo ADMINISTRADOR y nada clínico."""

from fastapi import APIRouter

from app.api.deps import ServicioDeDashboardTecnico, SesionAdmin
from app.schemas.dashboard_tecnico import (
    Latencia,
    ModeloVigenteResumen,
    RespuestaDashboardTecnico,
    ResumenAnalisis,
    Seguridad,
    ServicioResumen,
    Usuarios,
)
from app.schemas.errores import RespuestaError
from app.schemas.monitoreo import AlertaEstado

router = APIRouter(prefix="/admin", tags=["dashboard técnico"])

ERRORES = {code: {"model": RespuestaError} for code in (401, 403)}


@router.get("/dashboard", response_model=RespuestaDashboardTecnico, responses=ERRORES)
def dashboard_tecnico(sesion: SesionAdmin, servicio: ServicioDeDashboardTecnico):
    """Pantalla inicial del administrador (RF-DB02 CA 1 a 4, 6 y 8).

    Las métricas del modelo (CA 5 y 9) se piden aparte a `/admin/modelo/metricas`.
    Los servicios reutilizan la medición del estado operativo (máximo 30 s de antigüedad).
    """
    d = servicio.resumen()
    m = d.estado.modelo_desplegado
    return RespuestaDashboardTecnico(
        usuarios=Usuarios(
            por_estado={e.value: n for e, n in d.cuentas.por_estado.items()},
            por_rol={r.value: n for r, n in d.cuentas.por_rol.items()},
            pendientes_expiradas=d.cuentas.pendientes_expiradas,
        ),
        seguridad=Seguridad(
            accesos_fallidos_24h=d.accesos_fallidos_24h,
            cuentas_bloqueadas=d.cuentas.bloqueadas,
        ),
        analisis=ResumenAnalisis(
            hoy=d.analisis.hoy,
            ultimos_7_dias=d.analisis.ultimos_7_dias,
            con_error_7_dias=d.analisis.con_error_7_dias,
            calidad_insuficiente_7_dias=d.analisis.calidad_insuficiente_7_dias,
        ),
        latencia_7d=Latencia(
            vision_p95_ms=d.latencia_7d.vision_p95_ms,
            llm_p95_ms=d.latencia_7d.llm_p95_ms,
            inferencias=d.latencia_7d.inferencias,
            errores=d.latencia_7d.errores,
        ),
        servicios=[
            ServicioResumen(codigo=s.codigo, nombre=s.nombre, estado=s.estado)
            for s in d.estado.servicios
        ],
        alerta=AlertaEstado(nivel=d.estado.alerta.nivel, mensaje=d.estado.alerta.mensaje)
        if d.estado.alerta
        else None,
        modelo_vigente=ModeloVigenteResumen(
            repositorio_hf=m.repositorio_hf,
            revision_corta=m.revision_sha[:7],
            desplegado_en=m.desplegado_en,
            coincide_con_configuracion=m.coincide_con_configuracion,
        )
        if m
        else None,
        envios_credencial_fallidos=d.envios_credencial_fallidos,
        verificado_en=d.estado.verificado_en,
    )
