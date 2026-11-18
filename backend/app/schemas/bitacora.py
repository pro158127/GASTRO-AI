"""JSON de la bitácora del administrador (contrato §7.3, W-21)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.paginacion import Paginacion


class PersonaBitacora(BaseModel):
    id: UUID
    nombre: str
    apellido: str
    cuenta_eliminada: bool


class EntradaBitacora(BaseModel):
    id: str = Field(examples=["1234"])  # bigint como texto: JavaScript no pierde precisión
    ocurrido_en: datetime
    actor: PersonaBitacora | None  # null = sin sesión (p. ej. correo inexistente en el login)
    accion: str = Field(examples=["CUENTA_BLOQUEADA"])
    accion_texto: str = Field(examples=["Bloqueo temporal de cuenta"])
    resultado: str = Field(examples=["EXITO"])
    objetivo: PersonaBitacora | None  # la cuenta sobre la que se hizo la acción, si aplica
    detalle: str | None = Field(examples=["Rechazado: contraseña incorrecta"])
    ip: str | None


class PaginaBitacora(BaseModel):
    items: list[EntradaBitacora]
    paginacion: Paginacion


class AccionFiltro(BaseModel):
    codigo: str
    texto: str


class UsuarioFiltro(BaseModel):
    id: UUID
    nombre: str  # «Ana Pérez»
    cuenta_eliminada: bool


class FiltrosBitacora(BaseModel):
    acciones: list[AccionFiltro]
    usuarios: list[UsuarioFiltro]
