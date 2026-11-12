"""Controlador de /imagenes: paso 1 de la carga (contrato §3.2, solo DOCTOR).

Recibe el archivo en multipart (campo «archivo»), lo lee con tope de 10 MB + 1 byte (así
un archivo gigante no se sube entero a la memoria, S-08) y se lo pasa al servicio.
"""

import re

from fastapi import APIRouter, UploadFile

from app.api.deps import ServicioDeImagenes, SesionDoctor
from app.schemas.analisis import ImagenCargada
from app.schemas.errores import RespuestaError
from app.services.verificadores_imagen import PESO_MAXIMO_BYTES, error_peso

router = APIRouter(prefix="/imagenes", tags=["análisis"])

ERRORES = {code: {"model": RespuestaError} for code in (401, 403, 413, 415, 422, 503)}
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def nombre_visible(nombre: str | None) -> str:
    """Solo el nombre (sin carpetas), sin caracteres de control y cortico. Nunca se guarda."""
    limpio = _CONTROL.sub("", (nombre or "").replace("\\", "/").rsplit("/", 1)[-1]).strip()
    return limpio[:120] or "imagen"


@router.post("", status_code=201, response_model=ImagenCargada, responses=ERRORES)
def cargar(archivo: UploadFile, sesion: SesionDoctor, servicio: ServicioDeImagenes):
    """Carga la imagen al área temporal (W-06a, W-06f, W-06g).

    - 413 IMAGEN_DEMASIADO_PESADA (W-06d) · 415 IMAGEN_FORMATO_NO_PERMITIDO (W-06c)
    - 422 IMAGEN_ILEGIBLE · 422 IMAGEN_RESOLUCION_INSUFICIENTE (menos de 224 × 224)
    """
    contenido = archivo.file.read(PESO_MAXIMO_BYTES + 1)
    if len(contenido) > PESO_MAXIMO_BYTES:
        raise error_peso()
    temporal = servicio.cargar(sesion.usuario.id, contenido)
    return ImagenCargada(
        imagen_id=temporal.imagen_id,
        nombre=nombre_visible(archivo.filename),
        formato=temporal.formato.value,
        ancho=temporal.ancho,
        alto=temporal.alto,
        peso_bytes=temporal.peso_bytes,
        sha256=temporal.sha256,
        expira_en=temporal.expira_en,
    )
