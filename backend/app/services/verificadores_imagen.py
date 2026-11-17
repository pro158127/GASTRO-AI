"""Los porteros de la imagen (patrón Cadena de responsabilidad, RF-D02, hallazgo S-08).

Cada eslabón revisa una cosa y, si no cumple, truena con su error del contrato; si
cumple, le pasa la imagen al que sigue. Van del más barato al más caro: primero el peso
(ni abrimos 50 MB de basura), luego el formato real por los bytes (la extensión y el
content-type que manda el navegador no valen nada) y al final la resolución.

La calidad (borrosa, oscura, reflejos) NO va aquí: esa la mide el worker en la etapa
CALIDAD (RF-P01), así el doctor ve en W-07b la causa con sus números.
"""

from __future__ import annotations

import io
import warnings
from abc import ABC, abstractmethod
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.errores import ErrorApi
from app.models import FormatoImagen

PESO_MAXIMO_BYTES = 10 * 1024 * 1024  # 10 MB (RF-D02 CA 5)
LADO_MINIMO = 224  # 224 × 224 px (RF-D02 CA 5)
# Más que esto ya es una bomba de descompresión (un PNG chiquito que se infla a gigas).
# 40 MP alcanza de sobra pa cualquier endoscopio (los 4K son 8 MP).
PIXELES_MAXIMOS = 40_000_000
PERMITIDOS = ["JPEG", "PNG"]
# Pillow le dice MPO al JPEG de varias imágenes que sacan algunas cámaras; es JPEG igual
_FORMATOS_PILLOW = {"JPEG": FormatoImagen.JPEG, "MPO": FormatoImagen.JPEG, "PNG": FormatoImagen.PNG}


@dataclass
class ImagenCandidata:
    """Lo que va pasando por la cadena. Los eslabones van llenando formato e imagen."""

    contenido: bytes
    formato: FormatoImagen | None = None
    imagen: Image.Image | None = None


class Verificador(ABC):
    def __init__(self) -> None:
        self._siguiente: Verificador | None = None

    def enlazar(self, siguiente: Verificador) -> Verificador:
        """Devuelve el siguiente pa poder escribir a.enlazar(b).enlazar(c)."""
        self._siguiente = siguiente
        return siguiente

    def verificar(self, candidata: ImagenCandidata) -> None:
        self._revisar(candidata)  # truena con ErrorApi si no cumple
        if self._siguiente is not None:
            self._siguiente.verificar(candidata)

    @abstractmethod
    def _revisar(self, candidata: ImagenCandidata) -> None: ...


class VerificadorPeso(Verificador):
    def _revisar(self, candidata: ImagenCandidata) -> None:
        if len(candidata.contenido) > PESO_MAXIMO_BYTES:
            raise error_peso()


class VerificadorFormato(Verificador):
    """Abre la imagen con Pillow: el formato sale de los bytes, no del nombre (S-08)."""

    def _revisar(self, candidata: ImagenCandidata) -> None:
        with warnings.catch_warnings():
            # La advertencia de bomba se vuelve error: ni la decodificamos
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            try:
                imagen = Image.open(io.BytesIO(candidata.contenido))
            except (UnidentifiedImageError, Image.DecompressionBombError):
                # DICOM, PDF, ejecutables, lo que sea que no es imagen conocida (RF-D02 CA 7)
                raise error_formato() from None
            except (OSError, Image.DecompressionBombWarning):
                raise error_ilegible() from None

            formato = _FORMATOS_PILLOW.get(imagen.format or "")
            if formato is None:  # GIF, WEBP, BMP, TIFF…: Pillow los abre, pero no se aceptan
                raise error_formato()
            if imagen.width * imagen.height > PIXELES_MAXIMOS:
                raise error_ilegible()
            try:
                imagen.load()  # decodifica todo: un JPEG cortado a la mitad truena aquí
            except (OSError, SyntaxError, ValueError, Image.DecompressionBombWarning):
                raise error_ilegible() from None
        candidata.formato = formato
        # Gira según la orientación EXIF antes de medir: así ancho y alto son los que se ven
        candidata.imagen = ImageOps.exif_transpose(imagen)


class VerificadorResolucion(Verificador):
    def _revisar(self, candidata: ImagenCandidata) -> None:
        assert candidata.imagen is not None, "VerificadorFormato va antes que este"
        if candidata.imagen.width < LADO_MINIMO or candidata.imagen.height < LADO_MINIMO:
            raise ErrorApi(
                422,
                "IMAGEN_RESOLUCION_INSUFICIENTE",
                f"La imagen debe medir al menos {LADO_MINIMO} × {LADO_MINIMO} píxeles.",
                extra={"minimo": {"ancho": LADO_MINIMO, "alto": LADO_MINIMO}},
            )


def construir_cadena() -> Verificador:
    """Peso → formato → resolución. Del más barato al más costoso."""
    inicio = VerificadorPeso()
    inicio.enlazar(VerificadorFormato()).enlazar(VerificadorResolucion())
    return inicio


def error_peso() -> ErrorApi:
    return ErrorApi(
        413,
        "IMAGEN_DEMASIADO_PESADA",
        "La imagen supera el máximo de 10 MB.",
        extra={"max_bytes": PESO_MAXIMO_BYTES},
    )


def error_formato() -> ErrorApi:
    return ErrorApi(
        415,
        "IMAGEN_FORMATO_NO_PERMITIDO",
        "Solo se aceptan imágenes JPEG o PNG.",
        extra={"permitidos": PERMITIDOS},
    )


def error_ilegible() -> ErrorApi:
    return ErrorApi(422, "IMAGEN_ILEGIBLE", "No pudimos leer la imagen. Intente con otro archivo.")


def limpiar(candidata: ImagenCandidata) -> bytes:
    """Vuelve a guardar la imagen sin EXIF, ICC ni textos incrustados (RF-D02 CA 6, RF-D03).

    Re-codificar es la única forma segura: borrar etiquetas a mano deja pedazos (miniaturas
    con la foto original, comentarios con nombres). Al JPEG le cuesta un poquito de calidad
    con 95, nada que el modelo note; el PNG queda igual píxel por píxel.
    """
    assert candidata.imagen is not None and candidata.formato is not None
    imagen = candidata.imagen.copy()
    imagen.info = {}  # sin esto Pillow vuelve a escribir el ICC y el EXIF que traía
    salida = io.BytesIO()
    if candidata.formato is FormatoImagen.JPEG:
        if imagen.mode not in ("RGB", "L"):  # CMYK o YCCK de algunos escáneres
            imagen = imagen.convert("RGB")
        imagen.save(salida, format="JPEG", quality=95, optimize=True)
    else:
        if imagen.mode not in ("RGB", "RGBA", "L", "LA"):  # paleta o 16 bits
            imagen = imagen.convert("RGBA" if "A" in imagen.getbands() else "RGB")
        imagen.save(salida, format="PNG", optimize=False)
    return salida.getvalue()
