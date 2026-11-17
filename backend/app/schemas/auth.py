"""JSON de entrada y salida de /auth, con los nombres del contrato (ARCHITECTURE.md §3.5)."""

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


class CambioContrasenaEntrada(BaseModel):
    contrasena_nueva: str = Field(min_length=1, max_length=256)
    confirmacion: str = Field(min_length=1, max_length=256)


class LogoutEntrada(BaseModel):
    # Opcional: el contrato no manda cuerpo; el servidor registra la inactividad por su cuenta
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
    ruta_inicial: str = Field(examples=["/doctor/dashboard"])


class Inactividad(BaseModel):
    """Segundos contados desde `ultima_actividad_en`: aviso al 540 y cierre al 600 (RF-U10)."""

    aviso_en_s: int = Field(examples=[540])
    cierre_en_s: int = Field(examples=[600])
    ultima_actividad_en: datetime


class RespuestaSesion(BaseModel):
    etapa: EtapaSesion
    usuario: UsuarioSesion
    inactividad: Inactividad


class RespuestaContinuar(BaseModel):
    ultima_actividad_en: datetime


class RespuestaTotpIniciar(BaseModel):
    otpauth_uri: str
    secreto_manual: str = Field(examples=["JBSW Y3DP EHPK 3PXP"])  # «¿No puede escanear?»
    qr_png_base64: str  # PNG en Base64, sin el prefijo data:
