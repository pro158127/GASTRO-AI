"""Controlador del dashboard clínico (W-15, RF-DB01): solo DOCTOR."""

from decimal import Decimal

from fastapi import APIRouter

from app.api.deps import ServicioDeDashboard, SesionDoctor
from app.models import EstadoUsuario
from app.schemas.dashboard import (
    AnalisisReciente,
    AvisoTraslado,
    Barra,
    CasosRecibidosResumen,
    ConcordanciaSalida,
    DashboardDoctor,
    Frecuencia,
    OrigenTraslado,
    ResumenDoctor,
)
from app.schemas.errores import RespuestaError
from app.services.dashboard import ROTULO_FRECUENCIA

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

ERRORES = {code: {"model": RespuestaError} for code in (401, 403)}


@router.get("/doctor", response_model=DashboardDoctor, responses=ERRORES)
def dashboard_doctor(sesion: SesionDoctor, servicio: ServicioDeDashboard):
    """Pantalla inicial del doctor (W-15). Solo su actividad; lo recibido por traslado va aparte.

    `primer_uso=true` → estado vacío «Realizar el primer análisis», sin gráficas (RF-DB01 CA 10).
    """
    d = servicio.del_doctor(sesion.usuario.id)
    recientes = []
    for a in d.recientes:
        superan = sorted(
            (r for r in a.resultados if r.supera_umbral), key=lambda r: r.probabilidad, reverse=True
        )
        recientes.append(
            AnalisisReciente(
                id=a.id,
                codigo=a.codigo,
                solicitado_en=a.solicitado_en,
                estado=a.estado.value,
                caracteristica_principal=superan[0].caracteristica.nombre if superan else None,
                caracteristicas_que_superan=[r.caracteristica.nombre for r in superan],
            )
        )
    porcentaje = d.concordancia.porcentaje
    return DashboardDoctor(
        primer_uso=d.primer_uso,
        resumen=ResumenDoctor(
            total_analisis=d.total,
            analisis_mes=d.mes,
            ultimos_7_dias=d.ultimos_7_dias,
            sin_valoracion=d.sin_valoracion,
        ),
        analisis_recientes=recientes,
        frecuencia=Frecuencia(
            rotulo=ROTULO_FRECUENCIA,
            barras=[
                Barra(caracteristica_id=c.id, codigo=c.codigo, nombre=c.nombre, analisis=n)
                for c, n in d.frecuencia
            ],
        ),
        concordancia=ConcordanciaSalida(
            porcentaje=Decimal(str(porcentaje)) if porcentaje is not None else None,
            coincide=d.concordancia.coincide,
            no_coincide=d.concordancia.no_coincide,
            no_concluyente=d.concordancia.no_concluyente,
        ),
        pacientes_con_seguimiento=d.pacientes_con_seguimiento,
        avisos_traslado=[
            AvisoTraslado(
                traslado_id=t.id,
                tipo=t.tipo.value,
                cantidad_casos=n,
                origen=OrigenTraslado(
                    nombre=t.origen.nombre,
                    apellido=t.origen.apellido,
                    cuenta_eliminada=t.origen.estado is EstadoUsuario.ELIMINADO,
                ),
                ejecutado_en=t.ejecutado_en,
            )
            for t, n in d.traslados_sin_ver
        ],
        casos_recibidos=CasosRecibidosResumen(
            traslados_nuevos=len(d.traslados_sin_ver), casos=d.casos_recibidos
        ),
    )
