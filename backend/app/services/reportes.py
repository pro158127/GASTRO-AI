"""Reporte PDF de resultados (RF-H02, contrato §4, REP-01 y REP-02).

- De uno o varios análisis (`analisis_ids`) o de todos los del paciente (`caso_id`, botón
  «Descargar reporte de este paciente», CA 4).
- Solo análisis de casos asignados al doctor (propios o recibidos por traslado). Uno ajeno
  responde 404, como si no existiera.
- Solo entran análisis COMPLETADOS: uno en proceso o fallido no tiene resultados.
- El PDF se guarda en MinIO (`reportes/{id}.pdf`) y solo lo descarga quien lo generó.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from app.adapters.almacen import Almacen, ErrorAlmacen
from app.core.errores import ErrorApi
from app.models import Analisis, EstadoAnalisis, Reporte, Usuario
from app.repositories.reportes_repository import RepositorioReportes
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.services.constructor_reporte import (
    ConstructorReporte,
    DatosAnalisisReporte,
    FilaCaracteristica,
    FilaObservacion,
    FilaRegion,
)

log = logging.getLogger(__name__)

MAXIMO_ANALISIS = 50  # un PDF razonable; más que eso se pide por partes
TIPO_PDF = "application/pdf"


def _no_encontrado() -> ErrorApi:
    return ErrorApi(404, "NO_ENCONTRADO", "Algún análisis no está disponible.")


def _nombre(u: Usuario) -> str:
    return f"{u.nombre} {u.apellido}".strip()


def _leer(almacen: Almacen, clave: str | None) -> bytes | None:
    """La imagen de MinIO, o None si no está: el PDF sale igual, con el recuadro vacío."""
    if not clave:
        return None
    try:
        return almacen.leer(clave)
    except ErrorAlmacen:
        log.warning("No se pudo leer una imagen para el reporte; va sin ella")
        return None


def datos_de(a: Analisis, almacen: Almacen, doctor_id: UUID) -> DatosAnalisisReporte:
    """Del modelo de la base a los datos planos que usa el constructor (sin nada del paciente).

    `doctor_id` es quien pide el reporte: si el análisis lo hizo otro, llegó por traslado.
    """
    resultados = sorted(a.resultados, key=lambda r: r.probabilidad, reverse=True)
    regiones = sorted(
        ((r, g) for r in resultados for g in r.regiones),
        key=lambda par: (-par[0].probabilidad, par[1].orden),
    )
    return DatosAnalisisReporte(
        codigo=a.codigo,
        solicitado_en=a.solicitado_en,
        realizado_por=_nombre(a.doctor_ejecutor),
        modelo=f"{a.modelo.repositorio_hf} · revisión {a.modelo.revision_sha[:7]}",
        caracteristicas=[
            FilaCaracteristica(
                r.caracteristica.nombre, r.probabilidad, r.umbral_aplicado, r.supera_umbral
            )
            for r in resultados
        ],
        regiones=[
            FilaRegion(i, r.caracteristica.nombre, r.probabilidad, g.area_porcentaje)
            for i, (r, g) in enumerate(regiones, start=1)
        ],
        explicacion_estado=a.explicacion.estado.value if a.explicacion else None,
        explicacion_texto=a.explicacion.texto if a.explicacion else None,
        observaciones=[
            FilaObservacion(o.valoracion.value, o.texto, _nombre(o.autor), o.registrada_en)
            for o in sorted(a.observaciones, key=lambda o: o.registrada_en)
        ],
        imagen=_leer(almacen, a.imagen_clave_objeto),
        # El mapa principal: la primera región de la característica más probable (como W-08)
        mapa_calor=_leer(almacen, regiones[0][1].mapa_calor_clave_objeto) if regiones else None,
        trasladado_de=_nombre(a.doctor_ejecutor) if a.doctor_ejecutor_id != doctor_id else None,
    )


@dataclass(frozen=True)
class ReporteGenerado:
    reporte: Reporte
    analisis: int


class ServicioReportes:
    def __init__(
        self,
        repositorio: RepositorioReportes,
        almacen: Almacen,
        unidad: UnidadTrabajo,
        reloj: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repo = repositorio
        self._almacen = almacen
        self._unidad = unidad
        self._reloj = reloj

    def generar(
        self, doctor: Usuario, analisis_ids: list[UUID] | None, caso_id: UUID | None
    ) -> ReporteGenerado:
        if caso_id is not None:
            if not self._repo.caso_es_mio(doctor.id, caso_id):
                raise ErrorApi(404, "NO_ENCONTRADO", "No encontramos este paciente.")
            elegidos = [
                a
                for a in self._repo.analisis_del_caso(doctor.id, caso_id)
                if a.estado is EstadoAnalisis.COMPLETADO
            ]
        else:
            pedidos = list(dict.fromkeys(analisis_ids or []))  # sin repetidos, en orden
            elegidos = self._repo.analisis(doctor.id, pedidos)
            if len(elegidos) != len(pedidos):
                raise _no_encontrado()
            if any(a.estado is not EstadoAnalisis.COMPLETADO for a in elegidos):
                raise ErrorApi(
                    422,
                    "ANALISIS_SIN_RESULTADO",
                    "Solo se pueden incluir análisis que ya tengan resultado.",
                )
        if not elegidos:
            raise ErrorApi(422, "SIN_ANALISIS", "No hay análisis con resultado para incluir.")
        if len(elegidos) > MAXIMO_ANALISIS:
            raise ErrorApi(
                422,
                "DEMASIADOS_ANALISIS",
                f"Un reporte puede tener hasta {MAXIMO_ANALISIS} análisis.",
            )

        reporte = self._repo.crear(doctor.id, [a.id for a in elegidos])
        constructor = ConstructorReporte().encabezado(
            _nombre(doctor), reporte.generado_en, len(elegidos), de_paciente=caso_id is not None
        )
        for a in elegidos:
            constructor.analisis(datos_de(a, self._almacen, doctor.id))
        clave = f"reportes/{reporte.id}.pdf"
        try:
            self._almacen.subir(clave, constructor.construir(), TIPO_PDF)
        except ErrorAlmacen:
            self._unidad.descartar()
            raise ErrorApi(
                503, "SERVICIO_NO_DISPONIBLE", "No pudimos guardar el reporte. Intenta de nuevo."
            ) from None
        reporte.archivo_clave_objeto = clave
        self._unidad.confirmar()
        return ReporteGenerado(reporte, len(elegidos))

    def descargar(self, doctor_id: UUID, reporte_id: UUID) -> tuple[bytes, str]:
        """El PDF y su nombre de archivo. Solo el doctor que lo generó (404 si no)."""
        reporte = self._repo.del_doctor(reporte_id, doctor_id)
        if reporte is None or not reporte.archivo_clave_objeto:
            raise ErrorApi(404, "NO_ENCONTRADO", "No encontramos este reporte.")
        try:
            pdf = self._almacen.leer(reporte.archivo_clave_objeto)
        except ErrorAlmacen:
            raise ErrorApi(
                503, "SERVICIO_NO_DISPONIBLE", "No pudimos leer el reporte. Intenta de nuevo."
            ) from None
        codigo = self._repo.primer_codigo(reporte.id) or str(reporte.id)
        return pdf, f"Reporte_GastroAI_{codigo}.pdf"
