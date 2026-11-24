"""JSON de salud del sistema: estado operativo, métricas del modelo y logs (contrato §7.4–7.6)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models import EstadoInferencia
from app.schemas.paginacion import Paginacion
from app.services.estado_operativo import EstadoServicio

# ---------------------------------------------------------------- estado operativo


class AlertaEstado(BaseModel):
    nivel: Literal["ERROR", "ADVERTENCIA"]
    mensaje: str


class ServicioEstado(BaseModel):
    codigo: str = Field(examples=["INFERENCIA_VISION"])
    nombre: str
    estado: EstadoServicio
    tiempo_respuesta_ms: int | None  # null si no respondió
    ultima_verificacion: datetime


class ModeloDesplegadoInfo(BaseModel):
    repositorio_hf: str
    revision_sha: str
    huella_pesos_sha256: str
    desplegado_en: datetime
    model_card_url: str | None
    coincide_con_configuracion: bool  # RF-A04 CA 3: la revisión vigente es la configurada
    revision_space: str | None  # la que informa el Space, si la manda


class RespuestaEstadoOperativo(BaseModel):
    verificado_en: datetime
    alerta: AlertaEstado | None  # el banner de W-22b
    servicios: list[ServicioEstado]
    modelo_desplegado: ModeloDesplegadoInfo | None  # null si no hay modelo vigente


# ------------------------------------------------------------------------ métricas


class Metricas(BaseModel):
    """null hasta tener el reporte RM-06: no se inventan cifras."""

    SENSIBILIDAD: float | None
    ESPECIFICIDAD: float | None
    F1: float | None
    ROC_AUC: float | None
    PR_AUC: float | None
    BRIER: float | None  # calibración (RNF-15)
    ECE: float | None  # calibración (RNF-15)


class CaracteristicaMetrica(BaseModel):
    id: int
    nombre: str


class MetricasCaracteristica(Metricas):
    caracteristica: CaracteristicaMetrica


class ModeloMetricas(BaseModel):
    repositorio_hf: str
    revision_sha: str


class RespuestaMetricas(BaseModel):
    """Sin reporte (W-23b) solo trae `disponible: false` (y el modelo, si hay uno vigente)."""

    disponible: bool
    modelo: ModeloMetricas | None = None
    rotulo: str | None = None
    conjunto_prueba: str | None = None
    fecha_reporte: date | None = None
    contiene_datos_clinicos: bool | None = None
    model_card_url: str | None = None
    macro: Metricas | None = None
    por_caracteristica: list[MetricasCaracteristica] | None = None


# ---------------------------------------------------------------------------- logs


class LogTecnico(BaseModel):
    """Sin `analisis_id` ni nada clínico: un log no se puede cruzar con un caso (RF-M03 CA 2)."""

    id: str = Field(examples=["L-000984"])
    ocurrido_en: datetime
    revision_modelo: str = Field(examples=["3f9c2ab"])
    latencia_vision_ms: int
    latencia_llm_ms: int | None  # null si no hubo llamada al LLM
    estado: EstadoInferencia
    codigo_error: str | None


class PaginaLogs(BaseModel):
    items: list[LogTecnico]
    paginacion: Paginacion
