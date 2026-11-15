"""Controlador de «Casos recibidos» (RF-A07, contrato §5): solo DOCTOR.

Nunca muestra el seudónimo ni qué administrador hizo el traslado.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.api.deps import ServicioDeCasosRecibidos, SesionDoctor
from app.models import EstadoUsuario, Usuario
from app.schemas.analisis import (
    AnalisisRecibido,
    BandejaRecibidos,
    BusquedaRecibidosEntrada,
    CasoRecibido,
    DoctorOrigen,
    PersonaOrigen,
    TrasladoRecibido,
)
from app.schemas.errores import RespuestaError
from app.schemas.paginacion import POR_PAGINA_MAXIMO
from app.services.casos_recibidos import Bandeja

router = APIRouter(tags=["casos recibidos"])

ERRORES = {code: {"model": RespuestaError} for code in (401, 403, 422)}


def _persona(u: Usuario) -> PersonaOrigen:
    return PersonaOrigen(
        nombre=u.nombre, apellido=u.apellido, cuenta_eliminada=u.estado is EstadoUsuario.ELIMINADO
    )


def _salida(bandeja: Bandeja, yo: UUID) -> BandejaRecibidos:
    traslados = []
    for b in bandeja.bloques:
        t = b.traslado
        filas = []
        for a in b.analisis:
            superan = sorted(
                (r for r in a.resultados if r.supera_umbral),
                key=lambda r: r.probabilidad,
                reverse=True,
            )
            filas.append(
                AnalisisRecibido(
                    id=a.id,
                    codigo=a.codigo,
                    solicitado_en=a.solicitado_en,
                    estado=a.estado.value,
                    caracteristica_principal=superan[0].caracteristica.nombre if superan else None,
                    probabilidad_principal=superan[0].probabilidad if superan else None,
                    # Caso trasladado dos veces: lo hizo alguien distinto del doctor de origen
                    # (y no el que consulta, que pudo analizar después al mismo paciente)
                    originalmente_de=_persona(a.doctor_ejecutor)
                    if a.doctor_ejecutor_id not in (t.origen_id, yo)
                    else None,
                )
            )
        traslados.append(
            TrasladoRecibido(
                id=t.id,
                tipo=t.tipo.value,
                ejecutado_en=t.ejecutado_en,
                nuevo=t.visto_en is None,
                origen=_persona(t.origen),
                casos=[
                    CasoRecibido(
                        caso_id=c.caso_id,
                        total_analisis=c.total_analisis,
                        ultimo_analisis_en=c.ultimo_analisis_en,
                    )
                    for c in b.casos
                ],
                analisis_total=b.analisis_total,
                analisis=filas,
            )
        )
    return BandejaRecibidos(
        nuevos=bandeja.nuevos,
        total_traslados=len(traslados),
        total_casos=sum(len(t.casos) for t in traslados),
        doctores_origen=[
            DoctorOrigen(id=u.id, **_persona(u).model_dump()) for u in bandeja.doctores_origen
        ],
        traslados=traslados,
        analisis_propios_paciente=bandeja.analisis_propios_paciente,
    )


@router.get("/casos-recibidos", response_model=BandejaRecibidos, responses=ERRORES)
def bandeja(
    sesion: SesionDoctor,
    servicio: ServicioDeCasosRecibidos,
    origen_id: UUID | None = None,
    limite: Annotated[int, Query(ge=0, le=POR_PAGINA_MAXIMO)] = 5,
):
    """Bandeja de casos recibidos por traslado (W-27): un bloque por traslado, el más reciente
    primero. `origen_id` filtra por doctor de origen; `limite` = análisis por bloque (0 = todos).
    """
    yo = sesion.usuario.id
    return _salida(servicio.bandeja(yo, origen_id, limite or None), yo)


@router.post("/casos-recibidos/buscar", response_model=BandejaRecibidos, responses=ERRORES)
def buscar(
    entrada: BusquedaRecibidosEntrada, sesion: SesionDoctor, servicio: ServicioDeCasosRecibidos
):
    """Los mismos bloques, solo de un paciente. `analisis_propios_paciente` = cuántos análisis
    de ese paciente hizo el doctor (aviso «también tiene N suyos»). Sin coincidencias: lista
    vacía, sin revelar si el paciente existe para otro doctor. 422 DOCUMENTO_INVALIDO.
    """
    yo = sesion.usuario.id
    return _salida(
        servicio.buscar(
            yo,
            entrada.tipo_documento,
            entrada.numero_documento,
            entrada.origen_id,
            entrada.limite or None,
        ),
        yo,
    )


@router.post(
    "/traslados/{traslado_id}/visto",
    status_code=204,
    responses={**ERRORES, 404: {"model": RespuestaError}},
)
def marcar_visto(traslado_id: UUID, sesion: SesionDoctor, servicio: ServicioDeCasosRecibidos):
    """El doctor abrió el bloque: deja de mostrarse «Nuevo» (RF-A07). 404 si no es suyo."""
    servicio.marcar_visto(sesion.usuario.id, traslado_id)
    return Response(status_code=204)
