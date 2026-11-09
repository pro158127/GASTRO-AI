"""Lo que hace el worker con cada análisis encolado (PROC-01), etapa por etapa (W-07).

Cada etapa se confirma apenas empieza, así el polling de GET /analisis/{id}/estado ve el
avance real. Si algo falla, el análisis queda FALLIDO con un código del catálogo
(`CodigoFalla`) y la etapa donde tronó; la traza va solo al log (CWE-209).

Módulo 6: ANONIMIZAR y CALIDAD. La CLASIFICACIÓN y el GRAD_CAM (Space de Hugging Face)
llegan en el módulo 7 como `clasificador`; mientras no exista, el análisis se queda en
CLASIFICAR esperando.
"""

import io
import logging
from collections.abc import Callable
from decimal import Decimal
from uuid import UUID

from PIL import Image

from app.adapters.almacen import Almacen
from app.models import Analisis, EstadoAnalisis, EtapaProceso
from app.repositories.analisis_repository import RepositorioAnalisis
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.services.analisis import CodigoFalla
from app.services.calidad_imagen import medir_calidad
from app.services.imagenes import tipo_contenido
from app.services.verificadores_imagen import ImagenCandidata, VerificadorFormato, limpiar

log = logging.getLogger("gastroia.worker")

# Recibe el análisis y la imagen limpia; guarda resultados o truena (módulo 7)
Clasificador = Callable[[Analisis, bytes], None]


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
    ) -> None:
        self._repo = repositorio
        self._almacen = almacen
        self._unidad = unidad
        self._clasificador = clasificador

    def procesar(self, analisis_id: UUID) -> None:
        analisis = self._repo.por_id(analisis_id)
        if analisis is None or analisis.estado is not EstadoAnalisis.PROCESANDO:
            return  # ya terminó: un mensaje repetido no lo rehace
        # Si sigue PROCESANDO es que el worker murió a la mitad (acks_late): se retoma
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

    def _fallar(self, analisis: Analisis, codigo: CodigoFalla) -> None:
        """FALLIDO con el código del catálogo. La etapa se deja donde iba pa pintar el ERROR."""
        analisis.estado = EstadoAnalisis.FALLIDO
        analisis.codigo_error = codigo.value
        self._unidad.confirmar()
