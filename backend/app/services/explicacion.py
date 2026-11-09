"""Explicación del resultado con Gemini (RF-R05, ANA-03, ANA-04, contrato §3.7).

Va después del resultado y nunca lo bloquea: si Gemini se cae, el análisis sigue
COMPLETADO y la explicación queda FALLIDA con su botón de reintentar (RF-R05 CA 3 y 5).

Lo que se le manda (y se guarda tal cual en `datos_enviados`, pa auditar y reintentar):
nombre de cada característica, probabilidad y umbral en %, si lo supera, y cada región
descrita en palabras («zona superior izquierda») con su % del área. Nada de imagen, mapas,
claves de MinIO ni coordenadas crudas (RF-R05 CA 2).

Antes de mostrar el texto, `validar_explicacion` lo revisa: si trae porcentajes que no
están en los datos o habla de cáncer, tratamientos o biopsias, se descarta (RECHAZADA).
"""

import logging
import re
import time
import unicodedata
from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any
from uuid import UUID

from app.adapters.llm import ErrorProveedorLLM, ServicioExplicacion
from app.core.errores import ErrorApi
from app.models import Analisis, EstadoAnalisis, EstadoExplicacion, ExplicacionLlm
from app.repositories.analisis_repository import RepositorioAnalisis
from app.repositories.unidad_trabajo import UnidadTrabajo

log = logging.getLogger("gastroia.worker")

MAX_INTENTOS = 3  # ANA-04
LONGITUD_MINIMA, LONGITUD_MAXIMA = 40, 1500
MENSAJE_NO_DISPONIBLE = (
    "Explicación no disponible. "
    "El resultado, la confianza y el mapa de calor siguen siendo válidos."
)
# Lo que el texto jamás debe traer: otras enfermedades, conductas clínicas o formato raro.
# Se compara sin tildes y en minúsculas.
TERMINOS_PROHIBIDOS = (
    "cancer",
    "carcinoma",
    "neoplasia",
    "tumor",
    "linfoma",
    "malign",
    "tratamiento",
    "antibiotic",
    "medicamento",
    "receta",
    "cirugia",
    "biopsia",
    "http",
    "**",
    "##",
)
_PORCENTAJE = re.compile(r"(\d+(?:[.,]\d+)?)\s*%")


class CodigoFallaExplicacion(StrEnum):
    """`codigo_error` de la explicación (contrato §3.7: ERR-3001 de ejemplo)."""

    NO_DISPONIBLE = "ERR-3001"  # Gemini no respondió, tardó más de 15 s o contestó otra cosa
    RECHAZADA = "ERR-3002"  # contestó, pero el validador descartó el texto


def _pct(valor: Decimal) -> float:
    return float(round(valor * 100, 1))


def ubicacion(x: Decimal, y: Decimal, ancho: Decimal, alto: Decimal) -> str:
    """Centro de la caja en palabras, por tercios: «zona superior izquierda», «zona central»."""
    cx, cy = x + ancho / 2, y + alto / 2
    vertical = "superior" if cy < Decimal(1) / 3 else "inferior" if cy > Decimal(2) / 3 else ""
    horizontal = "izquierda" if cx < Decimal(1) / 3 else "derecha" if cx > Decimal(2) / 3 else ""
    if not vertical and not horizontal:
        return "zona central"
    if not vertical:
        return f"zona media {horizontal}"
    return f"zona {vertical} {horizontal or 'central'}".strip()


def resumen_para_llm(analisis: Analisis) -> dict[str, Any]:
    """El JSON que va a Gemini. Solo números y palabras, ordenado por probabilidad."""
    resultados = sorted(analisis.resultados, key=lambda r: r.probabilidad, reverse=True)
    return {
        "caracteristicas": [
            {
                "nombre": r.caracteristica.nombre,
                "probabilidad_pct": _pct(r.probabilidad),
                "umbral_pct": _pct(r.umbral_aplicado),
                "supera_umbral": r.supera_umbral,
                "regiones": [
                    {
                        "orden": g.orden,
                        "ubicacion": ubicacion(g.caja_x, g.caja_y, g.caja_ancho, g.caja_alto),
                        "area_pct": float(g.area_porcentaje),
                    }
                    for g in sorted(r.regiones, key=lambda g: g.orden)
                ],
            }
            for r in resultados
        ]
    }


def _sin_tildes(texto: str) -> str:
    descompuesto = unicodedata.normalize("NFKD", texto.lower())
    return "".join(c for c in descompuesto if not unicodedata.combining(c))


def validar_explicacion(texto: str, resumen: dict[str, Any]) -> bool:
    """¿Se puede mostrar? Largo razonable, sin términos prohibidos y sin porcentajes inventados.

    Cada «N %» del texto debe ser (redondeado a ±0,5) una probabilidad, un umbral o un área
    de los datos: así no se cuela un «92 %» que el modelo nunca dijo (RF-R05 CA 2).
    """
    if not LONGITUD_MINIMA <= len(texto) <= LONGITUD_MAXIMA:
        return False
    plano = _sin_tildes(texto)
    if any(termino in plano for termino in TERMINOS_PROHIBIDOS):
        return False
    permitidos = [
        valor
        for c in resumen["caracteristicas"]
        for valor in (
            c["probabilidad_pct"],
            c["umbral_pct"],
            *(g["area_pct"] for g in c["regiones"]),
        )
    ]
    for numero in _PORCENTAJE.findall(texto):
        valor = float(numero.replace(",", "."))
        if not any(abs(valor - permitido) <= 0.5 for permitido in permitidos):
            return False
    return True


class ServicioExplicaciones:
    def __init__(
        self,
        repositorio: RepositorioAnalisis,
        redactor: ServicioExplicacion | None,
        unidad: UnidadTrabajo,
        modelo_llm: str,
        reloj: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repo = repositorio
        self._redactor = redactor  # None en la API: allá solo se consulta y se reintenta
        self._unidad = unidad
        self._modelo_llm = modelo_llm
        self._reloj = reloj

    # ------------------------------------------------------------- worker (Celery)

    def generar(self, analisis_id: UUID) -> None:
        """Pide la explicación si el análisis está COMPLETADO y la explicación PENDIENTE.

        Se puede llamar las veces que sea: lo que ya está GENERADA, FALLIDA o RECHAZADA no
        se toca (eso solo lo reabre ANA-04).
        """
        assert self._redactor is not None, "generar() solo corre en el worker"
        analisis = self._repo.por_id(analisis_id)
        if analisis is None or analisis.estado is not EstadoAnalisis.COMPLETADO:
            return
        explicacion = analisis.explicacion
        if explicacion is None:
            explicacion = ExplicacionLlm(
                analisis=analisis,
                estado=EstadoExplicacion.PENDIENTE,
                datos_enviados=resumen_para_llm(analisis),
                modelo_llm=self._modelo_llm,
                intentos=1,
            )
            self._repo.agregar(explicacion)
            self._unidad.confirmar()  # el front ya ve PENDIENTE (W-08c)
        if explicacion.estado is not EstadoExplicacion.PENDIENTE:
            return

        inicio = time.monotonic()
        try:
            texto = self._redactor.explicar(explicacion.datos_enviados)
        except ErrorProveedorLLM as error:
            log.warning("Explicación fallida del análisis %s: %r", analisis_id, error.__cause__)
            self._cerrar(explicacion, EstadoExplicacion.FALLIDA, inicio)
            return
        if not validar_explicacion(texto, explicacion.datos_enviados):
            log.warning("Explicación del análisis %s descartada por el validador", analisis_id)
            self._cerrar(explicacion, EstadoExplicacion.RECHAZADA, inicio)
            return
        explicacion.texto = texto
        self._cerrar(explicacion, EstadoExplicacion.GENERADA, inicio)

    def _cerrar(
        self, explicacion: ExplicacionLlm, estado: EstadoExplicacion, inicio: float
    ) -> None:
        latencia = int((time.monotonic() - inicio) * 1000)
        explicacion.estado = estado
        explicacion.modelo_llm = self._modelo_llm
        explicacion.latencia_ms = latencia
        explicacion.codigo_error = {
            EstadoExplicacion.FALLIDA: CodigoFallaExplicacion.NO_DISPONIBLE.value,
            EstadoExplicacion.RECHAZADA: CodigoFallaExplicacion.RECHAZADA.value,
        }.get(estado)
        if estado is EstadoExplicacion.GENERADA:
            explicacion.generada_en = self._reloj()
        else:
            explicacion.texto = None
        self._repo.registrar_latencia_llm(explicacion.analisis_id, latencia)
        self._unidad.confirmar()

    # ------------------------------------------------------------------- API

    @staticmethod
    def puede_reintentar(explicacion: ExplicacionLlm) -> bool:
        return (
            explicacion.estado in (EstadoExplicacion.FALLIDA, EstadoExplicacion.RECHAZADA)
            and explicacion.intentos < MAX_INTENTOS
        )

    def reintentar(self, analisis: Analisis) -> ExplicacionLlm:
        """ANA-04: vuelve a PENDIENTE con intentos + 1. El que encola es el controlador.

        - 409 EXPLICACION_NO_REINTENTABLE: ya está GENERADA o todavía PENDIENTE.
        - 429 REINTENTOS_AGOTADOS: ya van los 3 intentos.
        Atómico en la base: dos clics seguidos no gastan dos intentos.
        """
        explicacion = analisis.explicacion
        if explicacion is None or explicacion.estado not in (
            EstadoExplicacion.FALLIDA,
            EstadoExplicacion.RECHAZADA,
        ):
            raise ErrorApi(
                409, "EXPLICACION_NO_REINTENTABLE", "La explicación no se puede reintentar ahora."
            )
        if explicacion.intentos >= MAX_INTENTOS:
            raise ErrorApi(
                429,
                "REINTENTOS_AGOTADOS",
                "Ya se hicieron los 3 intentos de la explicación.",
                extra={"max_intentos": MAX_INTENTOS},
            )
        if not self._repo.reabrir_explicacion(explicacion.id, MAX_INTENTOS):
            raise ErrorApi(
                409, "EXPLICACION_NO_REINTENTABLE", "La explicación no se puede reintentar ahora."
            )
        self._unidad.confirmar()
        return explicacion

    def marcar_fallida(self, explicacion: ExplicacionLlm) -> None:
        """Si al reintentar no se pudo encolar: vuelve a FALLIDA (el intento ya se gastó)."""
        explicacion.estado = EstadoExplicacion.FALLIDA
        explicacion.codigo_error = CodigoFallaExplicacion.NO_DISPONIBLE.value
        self._unidad.confirmar()
