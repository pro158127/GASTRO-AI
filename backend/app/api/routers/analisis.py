"""Controlador de /analisis: solicitar, seguir el avance y ver el resultado (solo DOCTOR).

El administrador recibe 403 en todo esto: no ve datos clínicos (RF-U03 CA 2). Un análisis
de otro doctor responde 404, como si no existiera (S-01).
"""

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query

from app.api.deps import ServicioDeAnalisis, ServicioDeHistorial, SesionDoctor
from app.core.config import get_settings
from app.core.errores import ErrorApi
from app.models import Analisis, EstadoAnalisis, EstadoExplicacion, EstadoUsuario, Valoracion
from app.repositories.historial_repository import FiltroHistorial, Origen
from app.schemas.analisis import (
    AnalisisCreado,
    AnalisisResumen,
    AnalisisSalida,
    Autor,
    Caja,
    CalidadDetalle,
    CaracteristicaResultado,
    EstadoAnalisisSalida,
    Etapa,
    Explicacion,
    ExplicacionEstado,
    ExplicacionReintentada,
    FilaHistorial,
    ImagenAnalisis,
    MapaCalor,
    ModeloUsado,
    Observacion,
    ObservacionCreada,
    ObservacionEntrada,
    ObservacionGuardada,
    PaginaHistorial,
    RealizadoPor,
    RealizadoPorResumen,
    Region,
    SolicitudAnalisisEntrada,
    Trasladado,
)
from app.schemas.catalogo import Persona
from app.schemas.errores import RespuestaError
from app.schemas.paginacion import POR_PAGINA_MAXIMO, Paginacion
from app.services.analisis import DetalleAnalisis, SolicitudAnalisis, etapas_de
from app.services.explicacion import MENSAJE_NO_DISPONIBLE
from app.services.historial import limites_de_fechas

router = APIRouter(prefix="/analisis", tags=["análisis"])


def _errores(*codigos: int) -> dict:
    return {code: {"model": RespuestaError} for code in (401, 403, *codigos)}


@router.post(
    "", status_code=202, response_model=AnalisisCreado, responses=_errores(404, 410, 422, 503)
)
def solicitar(
    entrada: SolicitudAnalisisEntrada, sesion: SesionDoctor, servicio: ServicioDeAnalisis
):
    """Crea el análisis con la imagen cargada y lo manda a la cola (W-06b, W-06j, W-06k).

    - 422 DOCUMENTO_INVALIDO (W-06e) · 422 DOCUMENTO_NO_COINCIDE (W-06k)
    - 410 IMAGEN_EXPIRADA: la imagen temporal venció o ya se usó; cargarla de nuevo
    - 503 SERVICIO_NO_DISPONIBLE: no hay modelo vigente o la cola no responde
    """
    analisis = servicio.solicitar(
        sesion.usuario,
        SolicitudAnalisis(
            imagen_id=entrada.imagen_id,
            tipo_documento=entrada.tipo_documento,
            numero_documento=entrada.numero_documento,
            confirmacion_documento=entrada.confirmacion_documento,
        ),
    )
    return _creado(analisis)


@router.get("", response_model=PaginaHistorial, responses=_errores(422))
def mis_analisis(
    sesion: SesionDoctor,
    servicio: ServicioDeHistorial,
    pagina: Annotated[int, Query(ge=1)] = 1,
    por_pagina: Annotated[int, Query(ge=1, le=POR_PAGINA_MAXIMO)] = 20,
    origen: Origen = Origen.TODOS,
    estado: EstadoAnalisis | None = None,
    codigo: Annotated[str | None, Query(max_length=20)] = None,
    caracteristica: Annotated[str | None, Query(max_length=40)] = None,
    desde: date | None = None,
    hasta: date | None = None,
    orden: Literal["solicitado_en", "-solicitado_en"] = "-solicitado_en",
):
    """«Mis análisis» (W-16): propios y recibidos por traslado, los más recientes primero.

    - `origen`: `todos`, `propios` o `recibidos` (RF-A07 CA 5).
    - `codigo`: prefijo del código («A-2026-0001»). `caracteristica`: código; solo los que
      la superan. `desde`/`hasta`: días (hora de Colombia), ambos incluidos.
    - Nunca lleva datos del paciente.
    """
    inicio, fin = limites_de_fechas(desde, hasta)
    filtro = FiltroHistorial(
        pagina=pagina,
        por_pagina=por_pagina,
        origen=origen,
        estado=estado,
        codigo=codigo.strip().upper() if codigo and codigo.strip() else None,
        caracteristica=caracteristica.strip().upper()
        if caracteristica and caracteristica.strip()
        else None,
        desde=inicio,
        hasta=fin,
        ascendente=orden == "solicitado_en",
    )
    yo = sesion.usuario.id
    resultado = servicio.mis_analisis(yo, filtro)
    return PaginaHistorial(
        items=[fila_historial(a, yo) for a in resultado.analisis],
        paginacion=Paginacion(pagina=pagina, por_pagina=por_pagina, total=resultado.total),
    )


def fila_historial(a: Analisis, yo: UUID) -> FilaHistorial:
    """Una fila de «Mis análisis» o de «Buscar por paciente» (contrato §4, HIS-01)."""
    superan = sorted(
        (r for r in a.resultados if r.supera_umbral), key=lambda r: r.probabilidad, reverse=True
    )
    mia = next((o for o in a.observaciones if o.autor_id == yo), None)
    ejecutor = a.doctor_ejecutor
    return FilaHistorial(
        id=a.id,
        codigo=a.codigo,
        solicitado_en=a.solicitado_en,
        estado=a.estado.value,
        caracteristicas_que_superan=[r.caracteristica.nombre for r in superan],
        caracteristica_principal=superan[0].caracteristica.nombre if superan else None,
        probabilidad_principal=superan[0].probabilidad if superan else None,
        tiene_observacion=mia is not None,
        observacion=mia.valoracion.value if mia else None,
        modelo_revision=a.modelo.revision_sha[:7],
        trasladado=a.doctor_ejecutor_id != yo,
        realizado_por=RealizadoPorResumen(
            nombre=ejecutor.nombre,
            apellido=ejecutor.apellido,
            cuenta_eliminada=ejecutor.estado is EstadoUsuario.ELIMINADO,
        ),
    )


@router.post(
    "/{analisis_id}/observaciones",
    status_code=201,
    response_model=ObservacionCreada,
    responses=_errores(404, 409, 422),
)
def observar(
    analisis_id: UUID,
    entrada: ObservacionEntrada,
    sesion: SesionDoctor,
    servicio: ServicioDeAnalisis,
):
    """Valoración del doctor sobre el resultado (W-08, W-08e, W-08f, RF-D04).

    `valoracion`: COINCIDE, NO_COINCIDE o NO_CONCLUYENTE; `texto` opcional (hasta 2000).
    409 OBSERVACION_YA_REGISTRADA: ya registró la suya, no se sobrescribe.
    409 ANALISIS_NO_COMPLETADO: todavía no hay resultado.
    """
    o = servicio.observar(
        sesion.usuario, analisis_id, Valoracion(entrada.valoracion), entrada.texto
    )
    return ObservacionCreada(
        observacion=ObservacionGuardada(
            id=o.id,
            valoracion=o.valoracion.value,
            texto=o.texto,
            autor=Autor(id=o.autor.id, nombre=o.autor.nombre, apellido=o.autor.apellido),
            registrada_en=o.registrada_en,
        )
    )


def _creado(analisis: Analisis) -> AnalisisCreado:
    return AnalisisCreado(
        analisis=AnalisisResumen(
            id=analisis.id,
            codigo=analisis.codigo,
            estado=analisis.estado.value,
            solicitado_en=analisis.solicitado_en,
        )
    )


@router.post(
    "/{analisis_id}/reintento",
    status_code=202,
    response_model=AnalisisCreado,
    responses=_errores(404, 409, 503),
)
def reintentar(analisis_id: UUID, sesion: SesionDoctor, servicio: ServicioDeAnalisis):
    """Botón «Reintentar» de W-07c: vuelve a encolar el análisis FALLIDO, mismo código.

    409 NO_REINTENTABLE si no está FALLIDO o si falló por calidad (ERR-1001: cargar otra).
    """
    return _creado(servicio.reintentar(sesion.usuario.id, analisis_id))


@router.get(
    "/{analisis_id}/explicacion",
    response_model=ExplicacionEstado,
    response_model_exclude_none=True,
    responses=_errores(404),
)
def explicacion(analisis_id: UUID, sesion: SesionDoctor, servicio: ServicioDeAnalisis):
    """Polling de la explicación (W-08c) con `X-Actividad-Pasiva: 1`; parar al salir de
    PENDIENTE o a los 15 s. FALLIDA y RECHAZADA traen `mensaje` y `puede_reintentar` (W-08d).
    """
    analisis, exp = servicio.explicacion(sesion.usuario.id, analisis_id)
    if exp is None:
        if analisis.estado is EstadoAnalisis.FALLIDO:  # sin resultado no hay qué explicar
            raise ErrorApi(404, "NO_ENCONTRADO", "Este análisis no tiene explicación.")
        return ExplicacionEstado(estado=EstadoExplicacion.PENDIENTE.value)
    fallo = exp.estado in (EstadoExplicacion.FALLIDA, EstadoExplicacion.RECHAZADA)
    return ExplicacionEstado(
        estado=exp.estado.value,
        texto=exp.texto,
        generada_en=exp.generada_en,
        codigo_error=exp.codigo_error,
        mensaje=MENSAJE_NO_DISPONIBLE if fallo else None,
        intentos=exp.intentos,
        puede_reintentar=servicio.puede_reintentar_explicacion(exp),
    )


@router.post(
    "/{analisis_id}/explicacion/reintentar",
    status_code=202,
    response_model=ExplicacionReintentada,
    responses=_errores(404, 409, 429, 503),
)
def reintentar_explicacion(analisis_id: UUID, sesion: SesionDoctor, servicio: ServicioDeAnalisis):
    """Botón «Reintentar» de W-08d. Máximo 3 intentos en total.

    409 EXPLICACION_NO_REINTENTABLE (ya GENERADA o PENDIENTE) · 429 REINTENTOS_AGOTADOS.
    """
    exp = servicio.reintentar_explicacion(sesion.usuario.id, analisis_id)
    return ExplicacionReintentada(estado=exp.estado.value, intentos=exp.intentos)


def _calidad(analisis: Analisis) -> CalidadDetalle:
    def numero(valor) -> float | None:
        return float(valor) if valor is not None else None

    return CalidadDetalle(
        suficiente=analisis.calidad_suficiente,
        causas=[c.value for c in analisis.causas_calidad or []],
        nitidez=numero(analisis.calidad_nitidez),
        brillo=numero(analisis.calidad_brillo),
        saturados_pct=numero(analisis.calidad_saturados_pct),
    )


@router.get(
    "/{analisis_id}/estado",
    response_model=EstadoAnalisisSalida,
    response_model_exclude_none=True,
    responses=_errores(404),
)
def estado(analisis_id: UUID, sesion: SesionDoctor, servicio: ServicioDeAnalisis):
    """Avance para W-07 (polling cada 1–2 s con `X-Actividad-Pasiva: 1`).

    FALLIDO trae `codigo_error`; si fue por calidad (ERR-1001) también trae `calidad` con
    las causas (W-07b). COMPLETADO trae `resultado_url`.
    """
    analisis = servicio.obtener(sesion.usuario.id, analisis_id).analisis
    salida = EstadoAnalisisSalida(
        estado=analisis.estado.value,
        etapas=[Etapa(codigo=codigo, estado=valor) for codigo, valor in etapas_de(analisis)],
    )
    if analisis.estado is EstadoAnalisis.FALLIDO:
        salida.codigo_error = analisis.codigo_error
        if analisis.calidad_suficiente is False:
            salida.calidad = _calidad(analisis)
    elif analisis.estado is EstadoAnalisis.COMPLETADO:
        salida.resultado_url = f"{get_settings().api_prefix}/analisis/{analisis.id}"
    return salida


@router.get("/{analisis_id}", response_model=AnalisisSalida, responses=_errores(404))
def detalle(analisis_id: UUID, sesion: SesionDoctor, servicio: ServicioDeAnalisis):
    """Resultado completo (W-08, W-08b) y detalle del historial o de un caso recibido (W-17b).

    URLs firmadas que vencen en S3_URL_FIRMADA_SEGUNDOS. El umbral es el que se aplicó ese
    día. `ninguna_supera_umbral=true` activa el aviso de W-08b.
    """
    yo = sesion.usuario.id
    return _armar_detalle(servicio.obtener(yo, analisis_id), yo, servicio.url_firmada)


def _armar_detalle(detalle: DetalleAnalisis, yo: UUID, firmar) -> AnalisisSalida:
    a = detalle.analisis
    resultados = sorted(a.resultados, key=lambda r: r.probabilidad, reverse=True)
    probabilidad_de = {r.caracteristica_id: r.probabilidad for r in resultados}
    regiones = sorted(
        (g for r in resultados for g in r.regiones),
        key=lambda g: (-probabilidad_de[g.caracteristica_id], g.orden),
    )
    ejecutor = a.doctor_ejecutor
    traslado = detalle.traslado
    return AnalisisSalida(
        id=a.id,
        codigo=a.codigo,
        estado=a.estado.value,
        solicitado_en=a.solicitado_en,
        completado_en=a.completado_en,
        codigo_error=a.codigo_error,
        modelo=ModeloUsado(
            repositorio_hf=a.modelo.repositorio_hf,
            revision_sha=a.modelo.revision_sha,
            revision_corta=a.modelo.revision_sha[:7],
        ),
        imagen=ImagenAnalisis(
            url=firmar(a.imagen_clave_objeto),
            formato=a.imagen_formato.value,
            ancho=a.imagen_ancho,
            alto=a.imagen_alto,
        ),
        # El mapa principal = el de la primera región de la característica más probable
        mapa_calor=MapaCalor(url=firmar(regiones[0].mapa_calor_clave_objeto)) if regiones else None,
        calidad=_calidad(a),
        caracteristicas=[
            CaracteristicaResultado(
                id=r.caracteristica_id,
                codigo=r.caracteristica.codigo,
                nombre=r.caracteristica.nombre,
                probabilidad=r.probabilidad,
                umbral_aplicado=r.umbral_aplicado,
                supera_umbral=r.supera_umbral,
            )
            for r in resultados
        ],
        ninguna_supera_umbral=bool(resultados) and not any(r.supera_umbral for r in resultados),
        regiones=[
            Region(
                orden=g.orden,
                caracteristica_id=g.caracteristica_id,
                caja=Caja(x=g.caja_x, y=g.caja_y, ancho=g.caja_ancho, alto=g.caja_alto),
                area_porcentaje=g.area_porcentaje,
                confianza=probabilidad_de[g.caracteristica_id],
                mapa_calor_url=firmar(g.mapa_calor_clave_objeto),
            )
            for g in regiones
        ],
        explicacion=Explicacion(
            estado=a.explicacion.estado.value,
            texto=a.explicacion.texto,
            generada_en=a.explicacion.generada_en,
            intentos=a.explicacion.intentos,
        )
        if a.explicacion
        else None,
        observaciones=[
            Observacion(
                id=o.id,
                es_mia=o.autor_id == yo,
                valoracion=o.valoracion.value,
                texto=o.texto,
                autor=Persona(nombre=o.autor.nombre, apellido=o.autor.apellido),
                registrada_en=o.registrada_en,
            )
            for o in sorted(a.observaciones, key=lambda o: o.registrada_en)
        ],
        realizado_por=RealizadoPor(
            nombre=ejecutor.nombre,
            apellido=ejecutor.apellido,
            cuenta_eliminada=ejecutor.estado is EstadoUsuario.ELIMINADO,
            es_propio=ejecutor.id == yo,
        ),
        trasladado=Trasladado(
            desde=Persona(nombre=traslado.origen.nombre, apellido=traslado.origen.apellido),
            cuenta_eliminada=traslado.origen.estado is EstadoUsuario.ELIMINADO,
            fecha=traslado.ejecutado_en,
        )
        if traslado
        else None,
    )
