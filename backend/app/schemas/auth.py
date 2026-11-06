"""JSON de entrada y salida de /auth. Los nombres de campo son los de la especificación."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import CodigoRol, EtapaSesion


class LoginEntrada(BaseModel):
    correo: str = Field(min_length=3, max_length=254)
    # El máximo real es 64 (RF-U02); aquí se deja holgura pa no cortar antes de validar
    contrasena: str = Field(min_length=1, max_length=256)


class CodigoEntrada(BaseModel):
    codigo: str = Field(min_length=1, max_length=10, examples=["482913"])


class NuevaContrasenaEntrada(BaseModel):
    nueva_contrasena: str = Field(min_length=1, max_length=256)


class LogoutEntrada(BaseModel):
    motivo: Literal["manual", "inactividad"] = "manual"


class UsuarioSesion(BaseModel):
    id: UUID
    nombre: str
    apellido: str
    rol: CodigoRol


class RespuestaEtapa(BaseModel):
    etapa: EtapaSesion


class RespuestaIngreso(BaseModel):
    etapa: EtapaSesion
    usuario: UsuarioSesion


class RespuestaSesion(BaseModel):
    etapa: EtapaSesion
    vence_en: datetime  # el front pinta la advertencia del minuto 9 con esto (RF-U10 CA 3)
    usuario: UsuarioSesion


class RespuestaVencimiento(BaseModel):
    vence_en: datetime


class RespuestaVinculacion(BaseModel):
    otpauth_uri: str
    qr_png: str  # data:image/png;base64,…
    clave_texto: str  # alternativa accesible al QR (RF-U01 CA 10)
