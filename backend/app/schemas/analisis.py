"""JSON de la carga de imagen y del análisis (contrato §3.2 y §3.4 a §3.6).

Ningún esquema de salida tiene seudónimo ni documento: el análisis se identifica por su id.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.catalogo import Persona, Umbral

# RF-R04 CA 3 · especificacion_api.md §2: va en todo resultado, sin excepción
AVISO_EXPERIMENTAL = {
    "etiqueta": "Análisis experimental",
    "texto": (
        "Valoración preventiva probabilística experimental. No sustituye el juicio "
        "profesional. No constituye un diagnóstico clínico."
    ),
}


class ImagenCargada(BaseModel):
    imagen_id: str = Field(examples=["tmp_01J9ZK3M4N5P6Q7R8S9T0V1W2X"])
    nombre: str = Field(examples=["endoscopia_001.jpg"])
    formato: str = Field(examples=["JPEG"])
    ancho: int = Field(examples=[1920])
    alto: int = Field(examples=[1080])
    peso_bytes: int = Field(examples=[482113])
    sha256: str
    expira_en: datetime


class SolicitudAnalisisEntrada(BaseModel):
    imagen_id: str = Field(max_length=40, examples=["tmp_01J9ZK3M4N5P6Q7R8S9T0V1W2X"])
    tipo_documento: str = Field(max_length=5, examples=["CC"])
    numero_documento: str = Field(max_length=30, examples=["1234567890"])
    # Solo si /pacientes/consulta dijo tiene_historial=false (RF-D01 CA 12)
    confirmacion_documento: str | None = Field(default=None, max_length=30)


class AnalisisResumen(BaseModel):
    id: UUID
    codigo: str = Field(examples=["A-2026-000123"])
    estado: str = Field(examples=["PROCESANDO"])
    solicitado_en: datetime


class AnalisisCreado(BaseModel):
    analisis: AnalisisResumen


EstadoEtapa = Literal["LISTO", "EN_CURSO", "PENDIENTE", "ERROR"]


class Etapa(BaseModel):
    codigo: str = Field(examples=["CLASIFICAR"])
    estado: EstadoEtapa


class CalidadDetalle(BaseModel):
    suficiente: bool | None
    causas: list[str] = Field(examples=[["BORROSA"]])
    nitidez: float | None = None
    brillo: float | None = None
    saturados_pct: float | None = None


class EstadoAnalisisSalida(BaseModel):
    """Polling de W-07. Las llaves que no aplican al estado no se mandan (contrato §3.5)."""

    estado: str
    etapas: list[Etapa]
    codigo_error: str | None = None
    calidad: CalidadDetalle | None = None
    resultado_url: str | None = None


class ModeloUsado(BaseModel):
    repositorio_hf: str
    revision_sha: str
    revision_corta: str


class ImagenAnalisis(BaseModel):
    url: str
    formato: str
    ancho: int
    alto: int


class MapaCalor(BaseModel):
    url: str


class CaracteristicaResultado(BaseModel):
    id: int
    codigo: str
    nombre: str
    probabilidad: Umbral
    umbral_aplicado: Umbral  # el snapshot del momento, no el umbral de hoy (RF-A01 CA 2)
    supera_umbral: bool


class Caja(BaseModel):
    x: Umbral
    y: Umbral
    ancho: Umbral
    alto: Umbral


class Region(BaseModel):
    orden: int
    caracteristica_id: int
    caja: Caja
    area_porcentaje: Umbral
    confianza: Umbral
    mapa_calor_url: str


class Explicacion(BaseModel):
    estado: str
    texto: str | None
    generada_en: datetime | None
    intentos: int


class Observacion(BaseModel):
    id: UUID
    es_mia: bool
    valoracion: str
    texto: str | None
    autor: Persona
    registrada_en: datetime


class RealizadoPor(BaseModel):
    nombre: str
    apellido: str
    cuenta_eliminada: bool
    es_propio: bool


class Trasladado(BaseModel):
    desde: Persona
    cuenta_eliminada: bool
    fecha: datetime


class Aviso(BaseModel):
    etiqueta: str
    texto: str


class AnalisisSalida(BaseModel):
    id: UUID
    codigo: str
    estado: str
    solicitado_en: datetime
    completado_en: datetime | None
    codigo_error: str | None
    modelo: ModeloUsado
    imagen: ImagenAnalisis
    mapa_calor: MapaCalor | None
    calidad: CalidadDetalle
    caracteristicas: list[CaracteristicaResultado]
    ninguna_supera_umbral: bool
    regiones: list[Region]
    explicacion: Explicacion | None
    observaciones: list[Observacion]
    realizado_por: RealizadoPor
    trasladado: Trasladado | None
    aviso: Aviso = Aviso(**AVISO_EXPERIMENTAL)
