"""Errores de la API con una sola forma, y cero trazas pa afuera (CWE-209, RF-R05 CA 5).

Toda respuesta de error sale así:
    {"error": {"codigo": "EN_MAYUSCULAS", "mensaje": "Pa el usuario", "id_error": "ERR-7F3A"}}

El id_error queda también en el log del servidor junto con el detalle técnico, así el admin
lo busca cuando el doctor le dice «me salió el ERR-7F3A». El front lo muestra en W-31.
"""

import logging
import secrets

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("gastroia")

# Lo que responde Starlette por su cuenta (ruta inexistente, método equivocado…)
CODIGOS_HTTP = {
    400: ("PETICION_INVALIDA", "La petición no es válida."),
    401: ("SIN_SESION", "Inicia sesión para continuar."),
    403: ("SIN_PERMISO", "No tienes permiso para esta acción."),
    404: ("NO_ENCONTRADO", "No encontramos lo que buscas."),
    405: ("METODO_NO_PERMITIDO", "Esta acción no está disponible."),
    413: ("ARCHIVO_DEMASIADO_GRANDE", "El archivo supera el tamaño permitido."),
    429: ("DEMASIADOS_INTENTOS", "Demasiados intentos. Espera un momento."),
}


class ErrorApi(Exception):
    """Error esperado: los servicios lo lanzan y el manejador lo convierte en JSON.

    El mensaje es pa el usuario, así que va en español claro y sin detalles internos.
    """

    def __init__(self, estado: int, codigo: str, mensaje: str) -> None:
        super().__init__(mensaje)
        self.estado = estado
        self.codigo = codigo
        self.mensaje = mensaje


def nuevo_id_error() -> str:
    """ERR- + 4 hex al azar. Corto pa dictarlo por teléfono; no es secreto ni único global."""
    return f"ERR-{secrets.token_hex(2).upper()}"


def respuesta_error(estado: int, codigo: str, mensaje: str, id_error: str) -> JSONResponse:
    return JSONResponse(
        status_code=estado,
        content={"error": {"codigo": codigo, "mensaje": mensaje, "id_error": id_error}},
    )


async def _manejar_error_api(_: Request, error: ErrorApi) -> JSONResponse:
    id_error = nuevo_id_error()
    logger.info("%s %s %s", id_error, error.estado, error.codigo)
    return respuesta_error(error.estado, error.codigo, error.mensaje, id_error)


async def _manejar_validacion(_: Request, error: RequestValidationError) -> JSONResponse:
    # Ojo: el detalle de Pydantic trae el valor que mandó el cliente, y ahí puede venir un
    # número de documento. Solo se registran los NOMBRES de los campos, jamás los valores.
    id_error = nuevo_id_error()
    campos = sorted({".".join(str(p) for p in e.get("loc", ())) for e in error.errors()})
    logger.info("%s 422 DATOS_INVALIDOS campos=%s", id_error, campos)
    return respuesta_error(
        422, "DATOS_INVALIDOS", "Revisa los datos enviados e intenta de nuevo.", id_error
    )


async def _manejar_http(_: Request, error: StarletteHTTPException) -> JSONResponse:
    codigo, mensaje = CODIGOS_HTTP.get(
        error.status_code, ("ERROR_INTERNO", "Algo salió mal. Intenta de nuevo.")
    )
    return respuesta_error(error.status_code, codigo, mensaje, nuevo_id_error())


async def _manejar_inesperado(_: Request, error: Exception) -> JSONResponse:
    # El único lugar donde va la traza completa: al log del servidor, nunca al cliente
    id_error = nuevo_id_error()
    logger.exception("%s error no controlado", id_error, exc_info=error)
    return respuesta_error(500, "ERROR_INTERNO", "Algo salió mal. Intenta de nuevo.", id_error)


def registrar_manejadores(app: FastAPI) -> None:
    app.add_exception_handler(ErrorApi, _manejar_error_api)
    app.add_exception_handler(RequestValidationError, _manejar_validacion)
    app.add_exception_handler(StarletteHTTPException, _manejar_http)
    app.add_exception_handler(Exception, _manejar_inesperado)
