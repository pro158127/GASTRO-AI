"""JSON de catálogos, configuración de inferencia y consulta de paciente (ARCHITECTURE.md §3.5)."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, PlainSerializer

# Los Decimal salen como número (0.5), no como texto "0.5000" (contrato §1)
Umbral = Annotated[Decimal, PlainSerializer(float, return_type=float)]


class TipoDocumentoSalida(BaseModel):
    codigo: str = Field(examples=["CC"])
    nombre: str = Field(examples=["Cédula de ciudadanía"])
    longitud_maxima: int = Field(examples=[10])  # pa que el front valide igual que el servidor


class ListaTiposDocumento(BaseModel):
    items: list[TipoDocumentoSalida]


class CaracteristicaSalida(BaseModel):
    id: int
    codigo: str
    nombre: str


class ListaCaracteristicas(BaseModel):
    items: list[CaracteristicaSalida]


class UmbralCaracteristica(BaseModel):
    id: int
    codigo: str
    nombre: str
    umbral: Umbral | None
    umbral_por_defecto: Umbral | None
    activa: bool


class Persona(BaseModel):
    nombre: str
    apellido: str


class Rango(BaseModel):
    min: float = 0.10
    max: float = 0.90


class ConfiguracionSalida(BaseModel):
    usar_umbral_por_caracteristica: bool
    umbral_global: Umbral
    rango: Rango = Rango()
    caracteristicas: list[UmbralCaracteristica]
    actualizado_por: Persona | None
    actualizado_en: datetime


class UmbralEntrada(BaseModel):
    caracteristica_id: int
    umbral: Decimal | None = Field(default=None, examples=[0.6])


class ConfiguracionEntrada(BaseModel):
    usar_umbral_por_caracteristica: bool
    umbral_global: Decimal = Field(examples=[0.5])
    umbrales: list[UmbralEntrada] = []


class ConsultaPaciente(BaseModel):
    tipo_documento: str = Field(max_length=5, examples=["CC"])
    # Holgura pa los puntos y guiones; el largo real lo valida el servicio por tipo
    numero_documento: str = Field(max_length=30, examples=["1.234.567-890"])


class HistorialSalida(BaseModel):
    tiene_historial: bool
    caso_id: UUID | None = None
    total_analisis: int = 0
    ultimo_analisis_en: datetime | None = None
