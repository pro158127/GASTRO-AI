"""La forma del error, pa que salga documentada en /docs y el front sepa qué esperar."""

from pydantic import BaseModel, ConfigDict, Field


class ErrorCampo(BaseModel):
    campo: str = Field(examples=["correo"])
    mensaje: str = Field(examples=["Este campo es obligatorio."])


class DetalleError(BaseModel):
    # Algunos errores agregan datos propios (motivo, etapa, requisitos): se permiten extra
    model_config = ConfigDict(extra="allow")

    codigo: str = Field(examples=["PERMISO_DENEGADO"])
    mensaje: str = Field(examples=["No tienes permiso para esta acción."])
    campos: list[ErrorCampo] | None = None
    id_solicitud: str = Field(examples=["req_01JC5Z8X9Q2W3E4R5T6Y7U8I9O"])


class RespuestaError(BaseModel):
    error: DetalleError
