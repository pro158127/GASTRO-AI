"""Control de calidad de la imagen (RF-D02, RF-P01): borrosa, oscura o con reflejos.

Se mide sobre la imagen ya limpia, en escala de grises:
- nitidez = varianza del Laplaciano. Poca varianza = pocos bordes = imagen movida.
- brillo = promedio de los píxeles (0 negro puro, 255 blanco puro).
- saturados = % de píxeles casi blancos (≥ 250): los reflejos de la luz del endoscopio.

Se juntan TODAS las causas, no solo la primera, pa que W-07b le diga al doctor todo lo
que falló de una vez (el contrato manda una lista).
"""

from dataclasses import dataclass

import cv2
import numpy as np

from app.models import CausaCalidad

NITIDEZ_MINIMA = 85.0  # RF-D02: varianza del Laplaciano desde 85
BRILLO_MINIMO = 50.0  # RF-D02: brillo entre 50…
BRILLO_MAXIMO = 180.0  # …y 180
VALOR_SATURADO = 250  # de aquí pa arriba el píxel se considera quemado
SATURADOS_MAXIMO_PCT = 5.0  # docs/patrones_codigo/cadena_validacion.py: < 5 % de saturados


@dataclass(frozen=True)
class MedidaCalidad:
    nitidez: float
    brillo: float
    saturados_pct: float
    causas: list[CausaCalidad]

    @property
    def suficiente(self) -> bool:
        return not self.causas


class ImagenNoDecodificable(Exception):
    """OpenCV no pudo abrir los bytes (no debería pasar: la API ya los validó)."""


def medir_calidad(contenido: bytes) -> MedidaCalidad:
    gris = cv2.imdecode(np.frombuffer(contenido, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if gris is None:
        raise ImagenNoDecodificable()
    nitidez = float(cv2.Laplacian(gris, cv2.CV_64F).var())
    brillo = float(gris.mean())
    saturados_pct = float((gris >= VALOR_SATURADO).mean() * 100)

    causas: list[CausaCalidad] = []
    if nitidez < NITIDEZ_MINIMA:
        causas.append(CausaCalidad.BORROSA)
    if brillo < BRILLO_MINIMO:
        causas.append(CausaCalidad.OSCURA)
    if brillo > BRILLO_MAXIMO or saturados_pct >= SATURADOS_MAXIMO_PCT:
        causas.append(CausaCalidad.MUY_CLARA_O_REFLEJOS)
    return MedidaCalidad(round(nitidez, 2), round(brillo, 2), round(saturados_pct, 2), causas)
