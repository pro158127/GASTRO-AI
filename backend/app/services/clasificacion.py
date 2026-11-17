"""Etapas CLASIFICAR y GRAD_CAM del worker (PROC-01, RF-M01, RF-M03, RF-R03, RNF-29).

Le manda la imagen limpia al Space, comprueba que la revisión sea la del modelo vigente,
sube los mapas de calor a MinIO, aplica el umbral de ese momento (y lo copia en cada
resultado, RF-A01 CA 2) y deja el análisis COMPLETADO. Cada inferencia, buena o mala,
deja su renglón en LogInferencia con tiempos y estado, sin datos clínicos (RF-M03).

La explicación de Gemini va después y por aparte: el resultado ya queda guardado aunque el
LLM se caiga (RF-R05 CA 3).
"""

import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime

from app.adapters.almacen import Almacen
from app.adapters.inferencia import ErrorInferencia, SalidaModelo, ServicioInferencia
from app.models import (
    Analisis,
    EstadoAnalisis,
    EstadoInferencia,
    EtapaProceso,
    LogInferencia,
    RegionInteres,
    ResultadoCaracteristica,
)
from app.repositories.analisis_repository import RepositorioAnalisis
from app.repositories.catalogo_repository import RepositorioCatalogo
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.services.analisis import CodigoFalla
from app.services.politica_umbral import politica_desde, supera

log = logging.getLogger("gastroia.worker")


def _ms_desde(inicio: float) -> int:
    return int((time.monotonic() - inicio) * 1000)


class ServicioClasificacion:
    """Se le pasa a ServicioProcesamiento como `clasificador`: recibe (análisis, imagen)."""

    def __init__(
        self,
        inferencia: ServicioInferencia,
        almacen: Almacen,
        analisis: RepositorioAnalisis,
        catalogo: RepositorioCatalogo,
        unidad: UnidadTrabajo,
        reloj: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._inferencia = inferencia
        self._almacen = almacen
        self._analisis = analisis
        self._catalogo = catalogo
        self._unidad = unidad
        self._reloj = reloj

    def __call__(self, analisis: Analisis, contenido: bytes) -> None:
        inicio = time.monotonic()
        try:
            salida = self._inferencia.clasificar(contenido, analisis.imagen_formato)
            # RNF-29: si el Space carga otro modelo, el resultado no vale aunque se vea bien
            if salida.revision_sha != analisis.modelo.revision_sha.lower():
                raise ErrorInferencia("REVISION_DISTINTA")
            self._validar_caracteristicas(salida)
        except ErrorInferencia as error:
            self._fallar(analisis, error, _ms_desde(inicio))
            return
        latencia = _ms_desde(inicio)

        analisis.etapa_proceso = EtapaProceso.GRAD_CAM
        self._unidad.confirmar()
        self._guardar(analisis, salida, latencia)

    def _validar_caracteristicas(self, salida: SalidaModelo) -> None:
        """El Space debe devolver exactamente las características activas, ni una más ni menos.

        Si ML agrega o quita una, primero se actualiza el catálogo; si no, el resultado
        quedaría incompleto o con cosas que la UI no sabe mostrar.
        """
        activas = {c.codigo for c in self._catalogo.caracteristicas_activas()}
        if {c.codigo for c in salida.caracteristicas} != activas:
            raise ErrorInferencia("RESPUESTA_INVALIDA")

    def _guardar(self, analisis: Analisis, salida: SalidaModelo, latencia: int) -> None:
        config = self._catalogo.configuracion()
        if config is None:
            raise RuntimeError("Falta la fila de ConfiguracionInferencia: corre python -m app.seed")
        caracteristicas = {c.codigo: c for c in self._catalogo.caracteristicas_activas()}
        politica = politica_desde(
            config.usar_umbral_por_caracteristica,
            config.umbral_global,
            {codigo: c.umbral for codigo, c in caracteristicas.items()},
        )

        filas: list[object] = []
        regiones: list[object] = []
        for detectada in salida.caracteristicas:
            caracteristica = caracteristicas[detectada.codigo]
            umbral = politica.umbral_para(detectada.codigo)
            filas.append(
                ResultadoCaracteristica(
                    analisis_id=analisis.id,
                    caracteristica_id=caracteristica.id,
                    probabilidad=detectada.probabilidad,
                    umbral_aplicado=umbral,
                    supera_umbral=supera(detectada.probabilidad, umbral),
                )
            )
            for orden, region in enumerate(detectada.regiones, start=1):
                clave = f"mapas/{analisis.id}/{detectada.codigo}-{orden}.png"
                self._almacen.subir(clave, region.mapa_png, "image/png")
                regiones.append(
                    RegionInteres(
                        analisis_id=analisis.id,
                        caracteristica_id=caracteristica.id,
                        caja_x=region.x,
                        caja_y=region.y,
                        caja_ancho=region.ancho,
                        caja_alto=region.alto,
                        area_porcentaje=region.area_pct,
                        mapa_calor_clave_objeto=clave,
                        orden=orden,
                    )
                )
        # Primero los resultados: las regiones cuelgan de ellos por FK compuesta
        self._analisis.agregar(*filas)
        self._analisis.agregar(
            *regiones,
            LogInferencia(
                analisis_id=analisis.id,
                modelo_id=analisis.modelo_id,
                estado=EstadoInferencia.EXITO,
                latencia_vision_ms=latencia,
            ),
        )
        analisis.estado = EstadoAnalisis.COMPLETADO
        analisis.etapa_proceso = None
        analisis.completado_en = self._reloj()
        self._unidad.confirmar()

    def _fallar(self, analisis: Analisis, error: ErrorInferencia, latencia: int) -> None:
        """FALLIDO con ERR-1002 (W-07c); el motivo técnico solo va al log de inferencia."""
        log.warning("Inferencia fallida del análisis %s: %s", analisis.id, error.codigo)
        self._analisis.agregar(
            LogInferencia(
                analisis_id=analisis.id,
                modelo_id=analisis.modelo_id,
                estado=EstadoInferencia.TIEMPO_AGOTADO
                if error.tiempo_agotado
                else EstadoInferencia.ERROR,
                latencia_vision_ms=latencia,
                codigo_error=error.codigo,
            )
        )
        analisis.estado = EstadoAnalisis.FALLIDO
        analisis.codigo_error = CodigoFalla.SERVICIO_NO_DISPONIBLE.value
        self._unidad.confirmar()
