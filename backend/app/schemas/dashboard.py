"""JSON del dashboard clínico (contrato §5 + RF-DB01 CA 1 a 10)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.analisis import AVISO_EXPERIMENTAL, Aviso
from app.schemas.catalogo import Umbral


class ResumenDoctor(BaseModel):
    total_analisis: int  # acumulado (RF-DB01 CA 1)
    analisis_mes: int  # mes en curso, hora de Colombia (RF-DB01 CA 1)
    ultimos_7_dias: int
    sin_valoracion: int  # completados sin su observación


class AnalisisReciente(BaseModel):
    id: UUID
    codigo: str = Field(examples=["A-2026-000123"])  # identificador único (RNF-24)
    solicitado_en: datetime
    estado: str
    caracteristica_principal: str | None  # null = ninguna superó el umbral (o aún no termina)
    caracteristicas_que_superan: list[str]


class Barra(BaseModel):
    caracteristica_id: int
    codigo: str
    nombre: str
    analisis: int  # en cuántos análisis superó el umbral


class Frecuencia(BaseModel):
    rotulo: str  # RF-DB01 CA 4
    barras: list[Barra]  # gráfico de BARRAS, no circular (RF-DB01 CA 3)


class ConcordanciaSalida(BaseModel):
    porcentaje: Umbral | None = Field(examples=[81.3])  # null si aún no valoró nada
    coincide: int
    no_coincide: int
    no_concluyente: int  # se informa aparte, no entra al porcentaje


class OrigenTraslado(BaseModel):
    nombre: str
    apellido: str
    cuenta_eliminada: bool


class AvisoTraslado(BaseModel):
    traslado_id: UUID
    tipo: str = Field(examples=["DESACTIVACION"])
    cantidad_casos: int
    origen: OrigenTraslado
    ejecutado_en: datetime


class CasosRecibidosResumen(BaseModel):
    traslados_nuevos: int
    casos: int


class DashboardDoctor(BaseModel):
    primer_uso: bool  # sin análisis: estado vacío «Realizar el primer análisis» (RF-DB01 CA 10)
    resumen: ResumenDoctor
    analisis_recientes: list[AnalisisReciente]  # los 5 más recientes (RF-DB01 CA 2)
    frecuencia: Frecuencia
    concordancia: ConcordanciaSalida  # RF-DB01 CA 5
    pacientes_con_seguimiento: int  # casos con 2 o más análisis (RF-DB01 CA 6)
    avisos_traslado: list[AvisoTraslado]  # traslados recibidos sin abrir
    casos_recibidos: CasosRecibidosResumen  # aparte: no suman a sus indicadores (RF-A07 CA 2)
    aviso: Aviso = Aviso(**AVISO_EXPERIMENTAL)  # RF-DB01 CA 9
