"""Controlador de /pacientes: consulta previa al análisis (solo DOCTOR).

El documento viaja en el cuerpo de un POST, nunca en la URL ni en la query (RF-D01 CA 5),
y no sale en la respuesta.
"""

from fastapi import APIRouter

from app.api.deps import ServicioDeHistorial, ServicioDePacientes, SesionDoctor
from app.api.routers.analisis import fila_historial
from app.models import EstadoAnalisis
from app.repositories.historial_repository import FiltroHistorial
from app.schemas.analisis import BusquedaPacienteEntrada, PaginaHistorialPaciente
from app.schemas.catalogo import ConsultaPaciente, HistorialSalida
from app.schemas.errores import RespuestaError
from app.schemas.paginacion import Paginacion

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


@router.post("/analisis/buscar", response_model=PaginaHistorialPaciente, responses=ERRORES)
def buscar_analisis(
    entrada: BusquedaPacienteEntrada, sesion: SesionDoctor, servicio: ServicioDeHistorial
):
    """«Buscar por paciente» (W-16, pestaña de paciente): sus análisis conmigo, en orden
    cronológico (RF-H01 CA 1). POST pa que el documento no quede en la URL ni en los logs.

    Paciente ajeno o inexistente: 200 con `items: []`, sin revelar nada (RF-H01 CA 5).
    Documento mal escrito: 422 DOCUMENTO_INVALIDO.
    """
    filtro = FiltroHistorial(
        pagina=entrada.pagina,
        por_pagina=entrada.por_pagina,
        estado=EstadoAnalisis(entrada.estado) if entrada.estado else None,
        ascendente=entrada.orden == "solicitado_en",
    )
    yo = sesion.usuario.id
    resultado = servicio.de_paciente(yo, entrada.tipo_documento, entrada.numero_documento, filtro)
    return PaginaHistorialPaciente(
        items=[fila_historial(a, yo) for a in resultado.analisis],
        paginacion=Paginacion(
            pagina=entrada.pagina, por_pagina=entrada.por_pagina, total=resultado.total
        ),
        caso_id=resultado.casos[0] if resultado.casos else None,
        caso_ids=resultado.casos,
    )
