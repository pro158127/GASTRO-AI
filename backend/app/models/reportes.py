"""Módulo 4 · Reportes: los PDF que descarga el doctor y qué análisis lleva cada uno."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Text, func, text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.analisis import Analisis
    from app.models.usuarios import Usuario


class FormatoReporte(enum.StrEnum):
    PDF = "PDF"  # y nada más: RF-H02 CA 3. Si alguien pide Excel, la respuesta es no


class Reporte(Base):
    __tablename__ = "Reporte"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("Usuario.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    formato: Mapped[FormatoReporte] = mapped_column(
        ENUM(FormatoReporte, name="FormatoReporte", create_type=True), server_default=text("'PDF'")
    )
    archivo_clave_objeto: Mapped[str | None] = mapped_column(Text, nullable=True)  # el PDF en MinIO
    generado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    doctor: Mapped[Usuario] = relationship(back_populates="reportes")
    analisis: Mapped[list[ReporteAnalisis]] = relationship(back_populates="reporte")


class ReporteAnalisis(Base):
    """Tabla puente N:M: un reporte junta varios análisis y un análisis sale en varios reportes."""

    __tablename__ = "ReporteAnalisis"

    reporte_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("Reporte.id", ondelete="RESTRICT", onupdate="CASCADE"),
        primary_key=True,
    )
    analisis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("Analisis.id", ondelete="RESTRICT", onupdate="CASCADE"),
        primary_key=True,
    )

    reporte: Mapped[Reporte] = relationship(back_populates="analisis")
    analisis: Mapped[Analisis] = relationship(back_populates="reportes")
