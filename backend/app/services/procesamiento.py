"""Lo que hace el worker con cada análisis encolado (PROC-01), etapa por etapa (W-07).

Cada etapa se confirma apenas empieza, así el polling de GET /analisis/{id}/estado ve el
avance real. Si algo falla, el análisis queda FALLIDO con un código del catálogo
(`CodigoFalla`) y la etapa donde tronó; la traza va solo al log (CWE-209).

ANONIMIZAR y CALIDAD viven aquí; CLASIFICAR y GRAD_CAM (Space de Hugging Face) los hace
el `clasificador` que se inyecta (services/clasificacion.py). Sin clasificador, el análisis
se queda en CLASIFICAR (así se prueban las primeras etapas solas).

Si el worker muere a la mitad, Redis vuelve a entregar el mensaje (task_reject_on_worker_lost)
y se retoma desde el principio: resultados, regiones y LogInferencia se guardan en un solo
commit al final y los mapas usan claves fijas, así que no queda nada repetido. Después de
MAX_ENTREGAS se da por perdido: FALLIDO con ERR-1002 y el doctor puede reintentar.
"""

import io
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from PIL import Image

from app.adapters.almacen import Almacen
from app.models import Analisis, EstadoAnalisis, EstadoInferencia, EtapaProceso, LogInferencia
from app.repositories.analisis_repository import RepositorioAnalisis
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.services.analisis import CodigoFalla
from app.services.calidad_imagen import medir_calidad
from app.services.imagenes import tipo_contenido
from app.services.verificadores_imagen import ImagenCandidata, VerificadorFormato, limpiar

log = logging.getLogger("gastroia.worker")

# Recibe el análisis y la imagen limpia; guarda resultados o truena (services/clasificacion.py)
Clasificador = Callable[[Analisis, bytes], None]

# Entregas del mismo mensaje antes de darlo por perdido (la primera más dos reentregas)
MAX_ENTREGAS = 3
# Va en LogInferencia.codigo_error para distinguirlo en la supervisión
CODIGO_WORKER_PERDIDO = "WORKER_PERDIDO"


def tiene_metadatos(contenido: bytes) -> bool:
    """¿Le quedó EXIF, ICC o texto incrustado? Debería ser False siempre (se limpió al cargar)."""
    with Image.open(io.BytesIO(contenido)) as imagen:
        return (
            bool(imagen.getexif())
            or any(clave in imagen.info for clave in ("exif", "icc_profile", "comment", "xmp"))
            or any(isinstance(valor, str) for valor in imagen.info.values())
        )


class ServicioProcesamiento:
    def __init__(
        self,
        repositorio: RepositorioAnalisis,
        almacen: Almacen,
        unidad: UnidadTrabajo,
        clasificador: Clasificador | None = None,
        reloj: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repo = repositorio
        self._almacen = almacen
        self._unidad = unidad
        self._clasificador = clasificador
        self._reloj = reloj

    def procesar(self, analisis_id: UUID, entrega: int = 1) -> None:
        """Corre las etapas. `entrega` es cuántas veces ha llegado este mensaje (1 = primera)."""
        analisis = self._repo.por_id(analisis_id)
        if analisis is None or analisis.estado is not EstadoAnalisis.PROCESANDO:
            return  # ya terminó: un mensaje repetido no lo rehace
        if entrega > MAX_ENTREGAS:
            self._dar_por_perdido(analisis, entrega)
            return
        # Si sigue PROCESANDO y no es la primera entrega, el worker murió a la mitad: se retoma.
        # La marca de tiempo nueva evita que la API lo cierre por atascado mientras corre.
        analisis.procesando_desde = self._reloj()
        try:
            self._etapa(analisis, EtapaProceso.ANONIMIZAR)
            contenido = self._anonimizar(analisis)

            self._etapa(analisis, EtapaProceso.CALIDAD)
            if not self._calidad_suficiente(analisis, contenido):
                self._fallar(analisis, CodigoFalla.CALIDAD_INSUFICIENTE)
                return

            self._etapa(analisis, EtapaProceso.CLASIFICAR)
            if self._clasificador is not None:
                self._clasificador(analisis, contenido)
        except Exception:
            log.exception("Falló el procesamiento del análisis %s", analisis_id)
            self._unidad.descartar()
            self._fallar(analisis, CodigoFalla.ERROR_INTERNO)

    def _etapa(self, analisis: Analisis, etapa: EtapaProceso) -> None:
        analisis.etapa_proceso = etapa
        self._unidad.confirmar()

    def _anonimizar(self, analisis: Analisis) -> bytes:
        """Revisa que la imagen guardada siga sin metadatos; si algo se coló, la limpia otra vez.

        La API ya la limpió en POST /imagenes; esto es el cinturón además de los tirantes.
        """
        contenido = self._almacen.leer(analisis.imagen_clave_objeto)
        if not tiene_metadatos(contenido):
            return contenido
        log.warning("La imagen del análisis %s traía metadatos; se limpió de nuevo", analisis.id)
        candidata = ImagenCandidata(contenido)
        VerificadorFormato().verificar(candidata)
        assert candidata.formato is not None
        limpia = limpiar(candidata)
        self._almacen.subir(analisis.imagen_clave_objeto, limpia, tipo_contenido(candidata.formato))
        return limpia

    def _calidad_suficiente(self, analisis: Analisis, contenido: bytes) -> bool:
        medida = medir_calidad(contenido)
        analisis.calidad_nitidez = Decimal(str(medida.nitidez))
        analisis.calidad_brillo = Decimal(str(medida.brillo))
        analisis.calidad_saturados_pct = Decimal(str(medida.saturados_pct))
        analisis.calidad_suficiente = medida.suficiente
        analisis.causas_calidad = list(medida.causas)
        self._unidad.confirmar()
        return medida.suficiente

    def _dar_por_perdido(self, analisis: Analisis, entrega: int) -> None:
        """El worker murió en cada entrega: FALLIDO con ERR-1002 y su renglón en LogInferencia.

        La etapa se deja donde iba, así W-07c pinta el ERROR donde se quedó.
        """
        log.error(
            "Análisis %s: el worker se perdió %s veces; se marca FALLIDO", analisis.id, entrega - 1
        )
        self._repo.agregar(
            LogInferencia(
                analisis_id=analisis.id,
                modelo_id=analisis.modelo_id,
                estado=EstadoInferencia.ERROR,
                latencia_vision_ms=0,  # la llamada al Space nunca terminó
                codigo_error=CODIGO_WORKER_PERDIDO,
            )
        )
        self._fallar(analisis, CodigoFalla.SERVICIO_NO_DISPONIBLE)

    def _fallar(self, analisis: Analisis, codigo: CodigoFalla) -> None:
        """FALLIDO con el código del catálogo. La etapa se deja donde iba pa pintar el ERROR."""
        analisis.estado = EstadoAnalisis.FALLIDO
        analisis.codigo_error = codigo.value
        self._unidad.confirmar()
