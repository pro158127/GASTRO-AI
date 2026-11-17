"""JSON de /perfil y /admin/usuarios (contrato del frontend, ARCHITECTURE.md §3.5)."""

import re
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.models import CodigoRol, EstadoEnvio, EstadoUsuario, MotivoCredencial, TipoTraslado
from app.schemas.paginacion import Paginacion
from app.services.usuarios import CambiosCuenta

Texto = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]

PATRON_CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# [0-9] y no \d: en Python \d también acepta «５７３…» y otros dígitos Unicode
PATRON_TELEFONO = re.compile(r"^\+?[0-9]{7,15}$")


def normalizar_telefono(valor: str | None) -> str | None:
    """Quita espacios, guiones, puntos y paréntesis: «300 123-4567» → «3001234567»."""
    if valor is None or not valor.strip():
        return None
    limpio = re.sub(r"[\s\-().]", "", valor)
    if not PATRON_TELEFONO.fullmatch(limpio):
        raise ValueError("Teléfono no válido.")
    return limpio


def normalizar_correo(valor: str) -> str:
    limpio = valor.strip().lower()
    if len(limpio) > 254 or not PATRON_CORREO.fullmatch(limpio):
        raise ValueError("Correo no válido.")
    return limpio


# ------------------------------------------------------------------------- entradas


class EdicionPerfil(BaseModel):
    """PATCH: solo cambia lo que venga. `telefono: null` o "" lo borra (es opcional)."""

    nombre: Texto | None = None
    apellido: Texto | None = None
    telefono: str | None = Field(default=None, max_length=30)

    @field_validator("telefono")
    @classmethod
    def _telefono(cls, valor: str | None) -> str | None:
        return normalizar_telefono(valor)

    def a_cambios(self, correo: str | None = None) -> CambiosCuenta:
        borrar = "telefono" in self.model_fields_set and self.telefono is None
        return CambiosCuenta(
            nombre=self.nombre,
            apellido=self.apellido,
            telefono=self.telefono,
            borrar_telefono=borrar,
            correo=correo,
        )


class EdicionUsuario(EdicionPerfil):
    correo: str | None = Field(default=None, max_length=254)

    @field_validator("correo")
    @classmethod
    def _correo(cls, valor: str | None) -> str | None:
        return None if valor is None else normalizar_correo(valor)


class NuevoUsuario(BaseModel):
    nombre: Texto
    apellido: Texto
    correo: str = Field(max_length=254)
    telefono: str | None = Field(default=None, max_length=30)
    rol: CodigoRol

    @field_validator("correo")
    @classmethod
    def _correo(cls, valor: str) -> str:
        return normalizar_correo(valor)

    @field_validator("telefono")
    @classmethod
    def _telefono(cls, valor: str | None) -> str | None:
        return normalizar_telefono(valor)


class CambioRol(BaseModel):
    rol: CodigoRol


class Baja(BaseModel):
    """Desactivar o eliminar. `destino_id` es obligatorio si el doctor tiene casos activos."""

    destino_id: UUID | None = None


class Reasignacion(BaseModel):
    destino_id: UUID
    caso_ids: list[UUID] | None = None  # null = todos los casos activos


# -------------------------------------------------------------------------- salidas


class RolPerfil(BaseModel):
    codigo: CodigoRol
    nombre: str


class Perfil(BaseModel):
    id: UUID
    nombre: str
    apellido: str
    correo: str | None
    telefono: str | None
    rol: RolPerfil
    estado: EstadoUsuario
    creado_en: datetime
    totp_vinculado: bool


class UsuarioResumen(BaseModel):
    id: UUID
    nombre: str
    apellido: str
    correo: str | None
    telefono: str | None
    rol: CodigoRol
    estado: EstadoUsuario
    bloqueado: bool
    creado_en: datetime
    activado_en: datetime | None
    # Solo en cuentas PENDIENTE: pa «Cuentas pendientes» (RF-U06 CA 2 y 4)
    estado_activacion: Literal["PENDIENTE", "EXPIRADA"] | None = None
    temporal_expira_en: datetime | None = None


class Credencial(BaseModel):
    motivo: MotivoCredencial
    estado: EstadoEnvio
    intentado_en: datetime
    codigo_error: str | None = None  # CORREO_NO_ENVIADO → la UI ofrece reenviar


class UsuarioDetalle(UsuarioResumen):
    casos_activos: int
    totp_vinculado: bool
    intentos_fallidos: int
    bloqueado_hasta: datetime | None
    envios_credencial: list[Credencial]


class PaginaUsuarios(BaseModel):
    items: list[UsuarioResumen]
    paginacion: Paginacion


class RespuestaUsuario(BaseModel):
    usuario: UsuarioResumen


class RespuestaCredencial(BaseModel):
    usuario: UsuarioResumen
    credencial: Credencial


class RespuestaEdicion(BaseModel):
    usuario: UsuarioResumen
    credencial: Credencial | None = None  # solo si cambió el correo


class TrasladoResumen(BaseModel):
    id: UUID
    tipo: TipoTraslado
    casos_trasladados: int


class RespuestaBaja(BaseModel):
    usuario: UsuarioResumen
    traslado: TrasladoResumen | None = None


class RespuestaTraslado(BaseModel):
    traslado: TrasladoResumen
