"""Módulo 3 · Modelo y configuración: qué clasifica, qué modelo corre y con qué umbrales."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.analisis import Analisis, ResultadoCaracteristica
    from app.models.auditoria import LogInferencia
    from app.models.usuarios import Usuario


class NombreMetrica(enum.StrEnum):
    SENSIBILIDAD = "SENSIBILIDAD"
    ESPECIFICIDAD = "ESPECIFICIDAD"
    F1 = "F1"
    ROC_AUC = "ROC_AUC"
    PR_AUC = "PR_AUC"
    BRIER = "BRIER"
    ECE = "ECE"


class Caracteristica(Base):
    __tablename__ = "Caracteristica"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    codigo: Mapped[str] = mapped_column(
        Text, unique=True
    )  # el que manda el Space: ATROFIA, HPYLORI…
    nombre: Mapped[str] = mapped_column(Text)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    activa: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    # Umbral propio de 0.10 a 0.90 (CHECK en 0002); null = usa el global
    umbral: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    umbral_por_defecto: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 4), nullable=True
    )  # el de la model card (RF-A01)

    resultados: Mapped[list[ResultadoCaracteristica]] = relationship(
        back_populates="caracteristica"
    )
    metricas: Mapped[list[MetricaModelo]] = relationship(back_populates="caracteristica")


class ModeloDesplegado(Base):
    __tablename__ = "ModeloDesplegado"
    __table_args__ = (
        UniqueConstraint(
            "repositorio_hf",
            "revision_sha",
            name="ModeloDesplegado_repositorio_hf_revision_sha_key",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    repositorio_hf: Mapped[str] = mapped_column(Text)
    revision_sha: Mapped[str] = mapped_column(Text)  # SHA fijo, nunca «main» (RNF-29)
    huella_pesos_sha256: Mapped[str] = mapped_column(Text)
    model_card_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    desplegado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # Solo uno vigente a la vez; el trigger modelo_un_vigente de 0002 lo hace cumplir (RNF-29)
    es_vigente: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))

    analisis: Mapped[list[Analisis]] = relationship(back_populates="modelo")
    metricas: Mapped[list[MetricaModelo]] = relationship(back_populates="modelo")
    logs: Mapped[list[LogInferencia]] = relationship(back_populates="modelo")


class MetricaModelo(Base):
    """Las métricas del reporte de evaluación (RM-06), las que muestra RF-A05 y RF-DB02.

    Son de la evaluación en el conjunto de prueba, NO desempeño en producción. No las
    rotules distinto en la API.
    """

    __tablename__ = "MetricaModelo"
    __table_args__ = (
        UniqueConstraint(
            "modelo_id",
            "caracteristica_id",
            "metrica",
            "conjunto_prueba",
            name="MetricaModelo_unica",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    modelo_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("ModeloDesplegado.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    # null = métrica global del modelo, no de una característica
    caracteristica_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("Caracteristica.id", ondelete="SET NULL", onupdate="CASCADE"),
        nullable=True,
    )
    metrica: Mapped[NombreMetrica] = mapped_column(
        ENUM(NombreMetrica, name="NombreMetrica", create_type=True)
    )
    valor: Mapped[Decimal] = mapped_column(Numeric(6, 4))
    conjunto_prueba: Mapped[str] = mapped_column(Text)
    fecha_reporte: Mapped[date] = mapped_column(Date)

    modelo: Mapped[ModeloDesplegado] = relationship(back_populates="metricas")
    caracteristica: Mapped[Caracteristica | None] = relationship(back_populates="metricas")


class ConfiguracionInferencia(Base):
    """La única fila de configuración (id = 1, lo amarra un CHECK en 0002)."""

    __tablename__ = "ConfiguracionInferencia"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, server_default=text("1"), autoincrement=False
    )
    umbral_global: Mapped[Decimal] = mapped_column(Numeric(5, 4))  # 0.10 a 0.90 (RF-A01)
    usar_umbral_por_caracteristica: Mapped[bool] = mapped_column(
        Boolean, server_default=text("false")
    )
    actualizado_por: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("Usuario.id", ondelete="SET NULL", onupdate="CASCADE"),
        nullable=True,
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    actualizador: Mapped[Usuario | None] = relationship(back_populates="config_actualizada")
