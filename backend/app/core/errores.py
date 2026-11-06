"""Errores de la API con una sola forma, y cero trazas pa afuera (CWE-209, RF-R05 CA 5).

Forma (contrato del frontend, ARCHITECTURE.md §3.5):
    {"error": {"codigo": "...", "mensaje": "...", "campos": [...]?, "id_solicitud": "req_..."}}

- `id_solicitud` identifica la petición: queda en el log junto con el detalle técnico, así
  soporte encuentra el caso exacto.
- En los 5xx el `codigo` es un ERR-xxxx genérico (W-31: «informe al administrador este
  código»), sin decir qué falló. El mismo ERR-xxxx va al log con la traza.
- `campos` solo aparece cuando el error es de un campo concreto. Nunca repite el valor que
  mandó el cliente: ahí puede venir un número de documento.
"""

import logging
import secrets
import time
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("gastroia")

MENSAJE_INTERNO = "Algo salió mal. Intenta de nuevo."

# Lo que responde Starlette por su cuenta (ruta inexistente, método equivocado…)
CODIGOS_HTTP = {
    400: ("PETICION_INVALIDA", "La petición no es válida."),
    401: ("SESION_EXPIRADA", "Inicia sesión para continuar."),
    403: ("PERMISO_DENEGADO", "No tienes permiso para esta acción."),
    404: ("NO_ENCONTRADO", "No encontramos lo que buscas."),
    405: ("METODO_NO_PERMITIDO", "Esta acción no está disponible."),
    413: ("ARCHIVO_DEMASIADO_GRANDE", "El archivo supera el tamaño permitido."),
    429: ("DEMASIADOS_INTENTOS", "Demasiados intentos. Espera un momento."),
}

# Mensaje por tipo de error de Pydantic: genérico, en español y sin el valor enviado
MENSAJES_CAMPO = {
    "missing": "Este campo es obligatorio.",
    "string_too_short": "Es demasiado corto.",
    "string_too_long": "Es demasiado largo.",
    "string_type": "Debe ser texto.",
    "literal_error": "El valor no es una de las opciones permitidas.",
    "json_invalid": "El cuerpo no es un JSON válido.",
}

_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


class ErrorApi(Exception):
    """Error esperado: los servicios lo lanzan y el manejador lo convierte en JSON.

    `campos` = [{"campo", "mensaje"}]; `extra` = datos que el contrato pide en ese error
    (p. ej. `motivo` en SESION_EXPIRADA o `requisitos` en la política de contraseñas).
    """

    def __init__(
        self,
        estado: int,
        codigo: str,
        mensaje: str,
        campos: list[dict[str, str]] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(mensaje)
        self.estado = estado
        self.codigo = codigo
        self.mensaje = mensaje
        self.campos = campos
        self.extra = extra or {}


def nuevo_id_solicitud() -> str:
    """req_ + ULID: 26 caracteres, ordenables por tiempo y sin datos de la petición."""
    valor = (int(time.time() * 1000) << 80) | secrets.randbits(80)
    letras = []
    for _ in range(26):
        valor, resto = divmod(valor, 32)
        letras.append(_CROCKFORD[resto])
    return "req_" + "".join(reversed(letras))


def nuevo_codigo_interno() -> str:
    """ERR- + 4 hex: corto pa dictarlo por teléfono. El que se busca en el log."""
    return f"ERR-{secrets.token_hex(2).upper()}"


def respuesta_error(
    estado: int,
    codigo: str,
    mensaje: str,
    id_solicitud: str,
    campos: list[dict[str, str]] | None = None,
    extra: dict[str, Any] | None = None,
) -> JSONResponse:
    cuerpo: dict[str, Any] = {"codigo": codigo, "mensaje": mensaje}
    if campos:
        cuerpo["campos"] = campos
    cuerpo.update(extra or {})
    cuerpo["id_solicitud"] = id_solicitud
    return JSONResponse(status_code=estado, content={"error": cuerpo})


async def _manejar_error_api(_: Request, error: ErrorApi) -> JSONResponse:
    id_solicitud = nuevo_id_solicitud()
    logger.info("%s %s %s", id_solicitud, error.estado, error.codigo)
    return respuesta_error(
        error.estado, error.codigo, error.mensaje, id_solicitud, error.campos, error.extra
    )


def _nombre_campo(loc: tuple) -> str:
    # ("body", "correo") → "correo"; ("query", "pagina") → "pagina"
    partes = [str(p) for p in loc if p not in ("body", "query", "path", "header", "cookie")]
    return ".".join(partes) or "cuerpo"


async def _manejar_validacion(_: Request, error: RequestValidationError) -> JSONResponse:
    # Ojo: el detalle de Pydantic trae el valor que mandó el cliente, y ahí puede venir un
    # número de documento. Solo salen el NOMBRE del campo y un mensaje genérico.
    id_solicitud = nuevo_id_solicitud()
    campos, vistos = [], set()
    for detalle in error.errors():
        nombre = _nombre_campo(tuple(detalle.get("loc", ())))
        if nombre in vistos:
            continue
        vistos.add(nombre)
        campos.append(
            {
                "campo": nombre,
                "mensaje": MENSAJES_CAMPO.get(detalle.get("type"), "Valor no válido."),
            }
        )
    logger.info("%s 422 DATOS_INVALIDOS campos=%s", id_solicitud, [c["campo"] for c in campos])
    return respuesta_error(
        422,
        "DATOS_INVALIDOS",
        "Revisa los datos enviados e intenta de nuevo.",
        id_solicitud,
        campos,
    )


async def _manejar_http(_: Request, error: StarletteHTTPException) -> JSONResponse:
    id_solicitud = nuevo_id_solicitud()
    if error.status_code >= 500:
        codigo = nuevo_codigo_interno()
        logger.error("%s %s %s", id_solicitud, codigo, error.status_code)
        return respuesta_error(error.status_code, codigo, MENSAJE_INTERNO, id_solicitud)
    codigo, mensaje = CODIGOS_HTTP.get(
        error.status_code, ("PETICION_INVALIDA", "La petición no es válida.")
    )
    return respuesta_error(error.status_code, codigo, mensaje, id_solicitud)


async def _manejar_inesperado(_: Request, error: Exception) -> JSONResponse:
    # El único lugar donde va la traza completa: al log del servidor, nunca al cliente
    id_solicitud = nuevo_id_solicitud()
    codigo = nuevo_codigo_interno()
    logger.exception("%s %s error no controlado", id_solicitud, codigo, exc_info=error)
    return respuesta_error(500, codigo, MENSAJE_INTERNO, id_solicitud)


def registrar_manejadores(app: FastAPI) -> None:
    app.add_exception_handler(ErrorApi, _manejar_error_api)
    app.add_exception_handler(RequestValidationError, _manejar_validacion)
    app.add_exception_handler(StarletteHTTPException, _manejar_http)
    app.add_exception_handler(Exception, _manejar_inesperado)
