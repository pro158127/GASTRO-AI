"""Controlador del reporte PDF (RF-H02): generarlo y descargarlo. Solo DOCTOR."""

from uuid import UUID

from fastapi import APIRouter, Response, status

from app.api.deps import ServicioDeReportes, SesionDoctor
from app.core.config import get_settings
from app.schemas.errores import RespuestaError
from app.schemas.reportes import ReporteCreado, SolicitudReporte

router = APIRouter(tags=["reportes"])

ERRORES = {code: {"model": RespuestaError} for code in (401, 403, 404, 422, 503)}


@router.post(
    "/reportes",
    status_code=status.HTTP_201_CREATED,
    response_model=ReporteCreado,
    responses=ERRORES,
)
def generar_reporte(entrada: SolicitudReporte, sesion: SesionDoctor, servicio: ServicioDeReportes):
    """Genera el PDF de uno o varios análisis (`analisis_ids`) o de todos los del paciente
    (`caso_id`, «Descargar reporte de este paciente»). Lleva el aviso experimental en cada
    página y nada que identifique al paciente.
    """
    generado = servicio.generar(sesion.usuario, entrada.analisis_ids, entrada.caso_id)
    r = generado.reporte
    return ReporteCreado(
        id=r.id,
        generado_en=r.generado_en,
        analisis=generado.analisis,
        descarga_url=f"{get_settings().api_prefix}/reportes/{r.id}/archivo",
    )


@router.get(
    "/reportes/{reporte_id}/archivo",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}, **ERRORES},
)
def descargar_reporte(reporte_id: UUID, sesion: SesionDoctor, servicio: ServicioDeReportes):
    """El PDF. Solo lo descarga el doctor que lo generó; si no, 404."""
    pdf, nombre = servicio.descargar(sesion.usuario.id, reporte_id)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{nombre}"',
            "Cache-Control": "no-store",  # trae resultados clínicos: que no quede en caché
        },
    )
