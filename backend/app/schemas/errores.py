"""La forma del error, pa que salga documentada en /docs y el front sepa qué esperar."""

from pydantic import BaseModel, Field


class DetalleError(BaseModel):
    codigo: str = Field(examples=["SIN_PERMISO"])
    mensaje: str = Field(examples=["No tienes permiso para esta acción."])
    id_error: str = Field(examples=["ERR-7F3A"])


class RespuestaError(BaseModel):
    error: DetalleError
