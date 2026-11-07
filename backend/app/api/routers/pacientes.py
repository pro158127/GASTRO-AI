"""Controlador de /pacientes: consulta previa al análisis (solo DOCTOR).

El documento viaja en el cuerpo de un POST, nunca en la URL ni en la query (RF-D01 CA 5),
y no sale en la respuesta.
"""

from fastapi import APIRouter

from app.api.deps import ServicioDePacientes, SesionDoctor
from app.schemas.catalogo import ConsultaPaciente, HistorialSalida
from app.schemas.errores import RespuestaError

router = APIRouter(prefix="/pacientes", tags=["pacientes"])

ERRORES = {code: {"model": RespuestaError} for code in (401, 403, 422, 429)}


@router.post("/consulta", response_model=HistorialSalida, responses=ERRORES)
def consultar(entrada: ConsultaPaciente, sesion: SesionDoctor, servicio: ServicioDePacientes):
    """¿Tengo historial de este paciente? (W-06h). Solo cuenta mis casos (propios o recibidos).

    Con historial → W-06b; sin historial → W-06i (pedir confirmar el número).
    Documento mal escrito: 422 DOCUMENTO_INVALIDO (W-06e).
    """
    historial = servicio.consultar(sesion.usuario, entrada.tipo_documento, entrada.numero_documento)
    if historial.caso_id is None:
        return HistorialSalida(tiene_historial=False)
    return HistorialSalida(
        tiene_historial=True,
        caso_id=historial.caso_id,
        total_analisis=historial.total_analisis,
        ultimo_analisis_en=historial.ultimo_analisis_en,
    )
