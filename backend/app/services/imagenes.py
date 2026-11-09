"""Carga de la imagen en dos pasos, paso 1: POST /imagenes (contrato §3.2, W-06a a W-06d).

La imagen pasa por los verificadores, se limpia (adiós EXIF) y queda en el área temporal
de MinIO (tmp/) con su dueño y su vencimiento en los metadatos. Todavía no hay análisis ni
paciente: eso llega en POST /analisis con el imagen_id, y ahí se mueve a analisis/.

El nombre original del archivo solo se devuelve en la respuesta pa que el front lo pinte:
no se guarda en ningún lado, porque más de uno le pone el nombre del paciente al archivo.
"""

import hashlib
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from app.adapters.almacen import PREFIJO_TEMPORAL, Almacen
from app.core.errores import ErrorApi, nuevo_ulid
from app.models import FormatoImagen
from app.services.verificadores_imagen import ImagenCandidata, Verificador, limpiar

_ID_TEMPORAL = re.compile(r"tmp_[0-9A-HJKMNP-TV-Z]{26}")


@dataclass(frozen=True)
class ImagenTemporal:
    imagen_id: str
    formato: FormatoImagen
    ancho: int
    alto: int
    peso_bytes: int
    sha256: str
    expira_en: datetime
    propietario_id: UUID

    @property
    def clave(self) -> str:
        return clave_temporal(self.imagen_id)

    def a_metadatos(self) -> dict[str, str]:
        """Pa los x-amz-meta-* de MinIO: solo texto ASCII, nada del paciente."""
        return {
            "propietario": str(self.propietario_id),
            "formato": self.formato.value,
            "ancho": str(self.ancho),
            "alto": str(self.alto),
            "peso": str(self.peso_bytes),
            "sha256": self.sha256,
            "expira": self.expira_en.isoformat(),
        }

    @classmethod
    def desde_metadatos(cls, imagen_id: str, datos: dict[str, str]) -> "ImagenTemporal":
        return cls(
            imagen_id=imagen_id,
            formato=FormatoImagen(datos["formato"]),
            ancho=int(datos["ancho"]),
            alto=int(datos["alto"]),
            peso_bytes=int(datos["peso"]),
            sha256=datos["sha256"],
            expira_en=datetime.fromisoformat(datos["expira"]),
            propietario_id=UUID(datos["propietario"]),
        )


def clave_temporal(imagen_id: str) -> str:
    return f"{PREFIJO_TEMPORAL}{imagen_id}"


def id_temporal_valido(imagen_id: str) -> bool:
    """Que sea tmp_ + ULID y nada más: así nadie mete «../» ni otras claves del bucket."""
    return bool(_ID_TEMPORAL.fullmatch(imagen_id))


def tipo_contenido(formato: FormatoImagen) -> str:
    return "image/png" if formato is FormatoImagen.PNG else "image/jpeg"


class ServicioImagenes:
    def __init__(
        self,
        cadena: Verificador,
        almacen: Almacen,
        vigencia: timedelta,
        reloj: Callable[[], datetime],
    ) -> None:
        self._cadena = cadena
        self._almacen = almacen
        self._vigencia = vigencia
        self._reloj = reloj

    def cargar(self, doctor_id: UUID, contenido: bytes) -> ImagenTemporal:
        """Verifica, limpia y guarda en tmp/. Truena con el ErrorApi del contrato si no cumple."""
        candidata = ImagenCandidata(contenido)
        self._cadena.verificar(candidata)
        assert candidata.imagen is not None and candidata.formato is not None
        limpia = limpiar(candidata)

        temporal = ImagenTemporal(
            imagen_id=f"tmp_{nuevo_ulid()}",
            formato=candidata.formato,
            ancho=candidata.imagen.width,
            alto=candidata.imagen.height,
            peso_bytes=len(limpia),
            sha256=hashlib.sha256(limpia).hexdigest(),
            expira_en=self._reloj() + self._vigencia,
            propietario_id=doctor_id,
        )
        self._almacen.subir(
            temporal.clave, limpia, tipo_contenido(temporal.formato), temporal.a_metadatos()
        )
        return temporal

    def tomar(self, doctor_id: UUID, imagen_id: str) -> ImagenTemporal:
        """La imagen temporal del doctor, si sigue vigente.

        - No existe o ya venció → 410 IMAGEN_EXPIRADA (el front pide cargarla otra vez).
        - Es de otro doctor → 404, como si no existiera (recurso ajeno).
        """
        datos = (
            self._almacen.metadatos(clave_temporal(imagen_id))
            if id_temporal_valido(imagen_id)
            else None
        )
        if datos is None:
            raise imagen_expirada()
        try:
            temporal = ImagenTemporal.desde_metadatos(imagen_id, datos)
        except (KeyError, ValueError):  # metadatos raros: mejor que la carguen de nuevo
            raise imagen_expirada() from None
        if temporal.propietario_id != doctor_id:
            raise ErrorApi(404, "NO_ENCONTRADO", "No encontramos esta imagen.")
        if temporal.expira_en <= self._reloj():
            raise imagen_expirada()
        return temporal


def imagen_expirada() -> ErrorApi:
    return ErrorApi(
        410, "IMAGEN_EXPIRADA", "La imagen cargada ya no está disponible. Cárguela de nuevo."
    )
