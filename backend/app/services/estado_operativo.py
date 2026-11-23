"""Estado operativo de la plataforma y del modelo desplegado (RF-A04, RNF-29).

El estado se mide en vivo (no hay tabla de salud en la base): corre los chequeos en paralelo,
cada uno con su tiempo máximo, y clasifica cada servicio en OPERATIVO, LENTO o SIN_RESPUESTA.
La última medición se guarda en memoria un rato (`VIGENCIA`) para que abrir el panel o el
dashboard técnico no le pegue a Gemini, al Space y al SMTP cada vez. El botón «Actualizar»
fuerza una medición nueva, salvo que la última tenga menos de `ESPERA_MINIMA` (anti-clics).
"""

import enum
import logging
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as TiempoAgotado
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.adapters.salud import INFERENCIA_VISION, Chequeo
from app.repositories.monitoreo_repository import RepositorioMonitoreo

log = logging.getLogger(__name__)

VIGENCIA = timedelta(seconds=30)
ESPERA_MINIMA = timedelta(seconds=10)
UMBRAL_LENTO_MS = 2000  # con un máximo de 3 s, pasar de 2 s ya es lento
MARGEN_S = 1.0  # cada chequeo tiene su timeout; esto es por si alguno no lo respeta


class EstadoServicio(enum.StrEnum):
    OPERATIVO = "OPERATIVO"
    LENTO = "LENTO"
    SIN_RESPUESTA = "SIN_RESPUESTA"


@dataclass(frozen=True)
class ResultadoServicio:
    codigo: str
    nombre: str
    estado: EstadoServicio
    tiempo_respuesta_ms: int | None
    ultima_verificacion: datetime
    dato: object = None


@dataclass(frozen=True)
class ModeloVigente:
    repositorio_hf: str
    revision_sha: str
    huella_pesos_sha256: str
    desplegado_en: datetime
    model_card_url: str | None
    coincide_con_configuracion: bool  # RF-A04 CA 3, RNF-29
    revision_space: str | None  # la que dice tener cargada el Space, si la informa


@dataclass(frozen=True)
class Alerta:
    nivel: str  # ERROR | ADVERTENCIA
    mensaje: str


@dataclass(frozen=True)
class EstadoOperativo:
    verificado_en: datetime
    alerta: Alerta | None
    servicios: list[ResultadoServicio]
    modelo_desplegado: ModeloVigente | None


class MemoriaEstado:
    """La última medición, compartida entre peticiones. Con candado: dos admins a la vez
    no disparan dos rondas de chequeos."""

    def __init__(self) -> None:
        self.candado = threading.Lock()
        self.ultima: tuple[datetime, list[ResultadoServicio]] | None = None


def _clasificar(ms: int) -> EstadoServicio:
    return EstadoServicio.LENTO if ms > UMBRAL_LENTO_MS else EstadoServicio.OPERATIVO


class ServicioEstadoOperativo:
    def __init__(
        self,
        chequeos: list[Chequeo],
        repositorio: RepositorioMonitoreo,
        memoria: MemoriaEstado,
        revision_configurada: str,
        reloj: Callable[[], datetime] = lambda: datetime.now(UTC),
        tiempo_maximo_s: float = 3.0,
    ) -> None:
        self._chequeos = chequeos
        self._repo = repositorio
        self._memoria = memoria
        self._revision = revision_configurada.strip().lower()
        self._reloj = reloj
        self._maximo = tiempo_maximo_s

    def consultar(self, forzar: bool = False) -> EstadoOperativo:
        """GET usa la medición guardada si sigue vigente; POST /verificar fuerza una nueva."""
        with self._memoria.candado:
            ahora = self._reloj()
            ultima = self._memoria.ultima
            edad = ahora - ultima[0] if ultima else None
            if ultima is None or edad >= (ESPERA_MINIMA if forzar else VIGENCIA):
                ultima = (ahora, self._medir())
                self._memoria.ultima = ultima
        verificado_en, servicios = ultima
        modelo = self._modelo(servicios)
        return EstadoOperativo(verificado_en, self._alerta(servicios, modelo), servicios, modelo)

    # ------------------------------------------------------------------ medición

    def _medir(self) -> list[ResultadoServicio]:
        """Corre todos los chequeos a la vez: el panel tarda lo que tarde el más lento."""
        hilos = ThreadPoolExecutor(max_workers=len(self._chequeos) or 1)
        try:
            tareas = [(c, hilos.submit(self._cronometrar, c)) for c in self._chequeos]
            resultados = []
            for chequeo, tarea in tareas:
                try:
                    ms, dato = tarea.result(timeout=self._maximo + MARGEN_S)
                    estado = _clasificar(ms)
                except TiempoAgotado:
                    ms, dato, estado = None, None, EstadoServicio.SIN_RESPUESTA
                except Exception as error:  # el servicio no respondió bien
                    # Solo el tipo: un mensaje de error puede traer URLs o datos de conexión
                    log.warning("Chequeo %s falló: %s", chequeo.codigo, type(error).__name__)
                    ms, dato, estado = None, None, EstadoServicio.SIN_RESPUESTA
                resultados.append(
                    ResultadoServicio(
                        chequeo.codigo, chequeo.nombre, estado, ms, self._reloj(), dato
                    )
                )
            return resultados
        finally:
            # No esperamos a un chequeo colgado: que termine solo en su hilo
            hilos.shutdown(wait=False, cancel_futures=True)

    @staticmethod
    def _cronometrar(chequeo: Chequeo) -> tuple[int, object]:
        inicio = time.perf_counter()
        dato = chequeo.probar()
        return round((time.perf_counter() - inicio) * 1000), dato

    # -------------------------------------------------------------------- modelo

    def _modelo(self, servicios: list[ResultadoServicio]) -> ModeloVigente | None:
        """El modelo vigente según la base, comparado con la revisión configurada (RNF-29)."""
        m = self._repo.modelo_vigente()
        if m is None:
            return None
        inferencia = next((s for s in servicios if s.codigo == INFERENCIA_VISION), None)
        en_space = inferencia.dato if inferencia and isinstance(inferencia.dato, str) else None
        return ModeloVigente(
            repositorio_hf=m.repositorio_hf,
            revision_sha=m.revision_sha,
            huella_pesos_sha256=m.huella_pesos_sha256,
            desplegado_en=m.desplegado_en,
            model_card_url=m.model_card_url,
            coincide_con_configuracion=bool(self._revision)
            and m.revision_sha.strip().lower() == self._revision,
            revision_space=en_space,
        )

    @staticmethod
    def _alerta(servicios: list[ResultadoServicio], modelo: ModeloVigente | None) -> Alerta | None:
        """El banner de W-22b. Los errores mandan sobre las advertencias."""
        errores: list[str] = []
        if modelo is None:
            errores.append("No hay un modelo de inferencia vigente registrado.")
        else:
            if not modelo.coincide_con_configuracion:
                errores.append(
                    "La revisión del modelo vigente no coincide con la configurada (RNF-29): "
                    "los análisis nuevos no se completarán."
                )
            if modelo.revision_space and modelo.revision_space != modelo.revision_sha.lower():
                errores.append("El servicio de inferencia tiene cargada otra revisión del modelo.")
        caidos = [s.nombre for s in servicios if s.estado is EstadoServicio.SIN_RESPUESTA]
        if caidos:
            errores.append("Sin respuesta: " + ", ".join(caidos) + ".")
        if errores:
            return Alerta("ERROR", " ".join(errores))
        lentos = [s.nombre for s in servicios if s.estado is EstadoServicio.LENTO]
        if lentos:
            return Alerta("ADVERTENCIA", "Responden con lentitud: " + ", ".join(lentos) + ".")
        return None
