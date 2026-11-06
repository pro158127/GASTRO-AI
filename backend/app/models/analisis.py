"""Módulo 2 · Casos y análisis: el paciente seudonimizado, sus análisis y lo que salió de cada uno.

Aquí NO hay número de documento por ningún lado, solo el seudónimo HMAC (RF-D01, RNF-04).
Si algún día ves una columna «cedula» en este archivo, algo salió muy mal.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.auditoria import LogInferencia, TrasladoCaso
    from app.models.modelo import Caracteristica, ModeloDesplegado
    from app.models.reportes import ReporteAnalisis
    from app.models.usuarios import Usuario


class EstadoCaso(enum.StrEnum):
    ACTIVO = "ACTIVO"
    CERRADO = "CERRADO"


class EstadoAnalisis(enum.StrEnum):
    PROCESANDO = "PROCESANDO"
    COMPLETADO = "COMPLETADO"
    FALLIDO = "FALLIDO"


class FormatoImagen(enum.StrEnum):
    JPEG = "JPEG"
    PNG = "PNG"


class CausaCalidad(enum.StrEnum):
    BORROSA = "BORROSA"
    OSCURA = "OSCURA"
    # Brillo mayor a 180 o demasiados píxeles saturados (RF-D02)
    MUY_CLARA_O_REFLEJOS = "MUY_CLARA_O_REFLEJOS"


class EstadoExplicacion(enum.StrEnum):
    PENDIENTE = "PENDIENTE"
    GENERADA = "GENERADA"
    FALLIDA = "FALLIDA"
    RECHAZADA = "RECHAZADA"


class Valoracion(enum.StrEnum):
    COINCIDE = "COINCIDE"
    NO_COINCIDE = "NO_COINCIDE"
    NO_CONCLUYENTE = "NO_CONCLUYENTE"


class CasoPaciente(Base):
    __tablename__ = "CasoPaciente"
    __table_args__ = (
        Index("CasoPaciente_doctor_asignado_id_seudonimo_idx", "doctor_asignado_id", "seudonimo"),
        Index("CasoPaciente_seudonimo_version_clave_idx", "seudonimo", "version_clave"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Inmutable: un trigger de 0002 truena si alguien intenta cambiarlo (RF-D01, RNF-25)
    seudonimo: Mapped[str] = mapped_column(Text)
    # Con qué versión de HMAC_CLAVES se calculó; sin esto la rotación de llaves no sirve (RNF-28)
    version_clave: Mapped[int] = mapped_column(Integer)
    doctor_asignado_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("Usuario.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    estado: Mapped[EstadoCaso] = mapped_column(
        ENUM(EstadoCaso, name="EstadoCaso", create_type=True), server_default=text("'ACTIVO'")
    )
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    doctor_asignado: Mapped[Usuario] = relationship(back_populates="casos_asignados")
    analisis: Mapped[list[Analisis]] = relationship(back_populates="caso")
    traslados: Mapped[list[TrasladoCaso]] = relationship(back_populates="caso")


class Analisis(Base):
    __tablename__ = "Analisis"
    __table_args__ = (
        Index("Analisis_caso_id_solicitado_en_idx", "caso_id", "solicitado_en"),
        Index(
            "Analisis_doctor_ejecutor_id_solicitado_en_idx", "doctor_ejecutor_id", "solicitado_en"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # El A-AAAA-NNNNNN que ve el doctor; sale de la secuencia analisis_codigo_seq (RNF-24)
    codigo: Mapped[str] = mapped_column(Text, unique=True)
    # Tampoco cambia nunca: trigger analisis_caso_fijo en 0002
    caso_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("CasoPaciente.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    doctor_ejecutor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("Usuario.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    modelo_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("ModeloDesplegado.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    imagen_clave_objeto: Mapped[str] = mapped_column(Text)  # dónde quedó en MinIO, ya sin EXIF
    imagen_sha256: Mapped[str] = mapped_column(Text)
    imagen_formato: Mapped[FormatoImagen] = mapped_column(
        ENUM(FormatoImagen, name="FormatoImagen", create_type=True)
    )
    imagen_ancho: Mapped[int] = mapped_column(Integer)
    imagen_alto: Mapped[int] = mapped_column(Integer)
    imagen_peso_bytes: Mapped[int] = mapped_column(Integer)
    calidad_suficiente: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    calidad_nitidez: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )  # varianza del Laplaciano
    calidad_brillo: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2), nullable=True
    )  # brillo medio, 0 a 255
    calidad_saturados_pct: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )  # % de píxeles quemados
    # Arreglo de enums. Ojo con el server_default: el cast al tipo es obligatorio en Postgres
    causas_calidad: Mapped[list[CausaCalidad]] = mapped_column(
        ARRAY(ENUM(CausaCalidad, name="CausaCalidad", create_type=True)),
        server_default=text('ARRAY[]::"CausaCalidad"[]'),
    )
    estado: Mapped[EstadoAnalisis] = mapped_column(
        ENUM(EstadoAnalisis, name="EstadoAnalisis", create_type=True),
        server_default=text("'PROCESANDO'"),
    )
    # El ERR-xxxx que le enseñamos al usuario en vez de la traza (RF-R05 CA 5)
    codigo_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    solicitado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    caso: Mapped[CasoPaciente] = relationship(back_populates="analisis")
    doctor_ejecutor: Mapped[Usuario] = relationship(back_populates="analisis_ejecutados")
    modelo: Mapped[ModeloDesplegado] = relationship(back_populates="analisis")
    resultados: Mapped[list[ResultadoCaracteristica]] = relationship(back_populates="analisis")
    explicacion: Mapped[ExplicacionLlm | None] = relationship(back_populates="analisis")
    observaciones: Mapped[list[ObservacionProfesional]] = relationship(back_populates="analisis")
    reportes: Mapped[list[ReporteAnalisis]] = relationship(back_populates="analisis")
    logs: Mapped[list[LogInferencia]] = relationship(back_populates="analisis")


class ResultadoCaracteristica(Base):
    __tablename__ = "ResultadoCaracteristica"
    __table_args__ = (
        Index(
            "ResultadoCaracteristica_caracteristica_id_supera_umbral_idx",
            "caracteristica_id",
            "supera_umbral",
        ),
    )

    analisis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("Analisis.id", ondelete="RESTRICT", onupdate="CASCADE"),
        primary_key=True,
    )
    caracteristica_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("Caracteristica.id", ondelete="RESTRICT", onupdate="CASCADE"),
        primary_key=True,
        autoincrement=False,
    )
    probabilidad: Mapped[Decimal] = mapped_column(Numeric(5, 4))
    # Copia del umbral de ese momento: cambiar la config no reescribe la historia (RF-A01 CA 2)
    umbral_aplicado: Mapped[Decimal] = mapped_column(Numeric(5, 4))
    supera_umbral: Mapped[bool] = mapped_column(
        Boolean
    )  # lo usa la gráfica del dashboard (RF-DB01 CA 3)

    analisis: Mapped[Analisis] = relationship(back_populates="resultados")
    caracteristica: Mapped[Caracteristica] = relationship(back_populates="resultados")
    regiones: Mapped[list[RegionInteres]] = relationship(back_populates="resultado")


class RegionInteres(Base):
    __tablename__ = "RegionInteres"
    __table_args__ = (
        Index(
            "RegionInteres_analisis_id_caracteristica_id_idx", "analisis_id", "caracteristica_id"
        ),
        # FK compuesta hacia el resultado: una región siempre cuelga de un resultado concreto
        ForeignKeyConstraint(
            ["analisis_id", "caracteristica_id"],
            ["ResultadoCaracteristica.analisis_id", "ResultadoCaracteristica.caracteristica_id"],
            name="RegionInteres_analisis_id_caracteristica_id_fkey",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analisis_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    caracteristica_id: Mapped[int] = mapped_column(Integer)
    # Caja normalizada de 0 a 1 (el CHECK está en 0002)
    caja_x: Mapped[Decimal] = mapped_column(Numeric(6, 4))
    caja_y: Mapped[Decimal] = mapped_column(Numeric(6, 4))
    caja_ancho: Mapped[Decimal] = mapped_column(Numeric(6, 4))
    caja_alto: Mapped[Decimal] = mapped_column(Numeric(6, 4))
    area_porcentaje: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    mapa_calor_clave_objeto: Mapped[str] = mapped_column(Text)  # el PNG del Grad-CAM en MinIO

    resultado: Mapped[ResultadoCaracteristica] = relationship(back_populates="regiones")


class ExplicacionLlm(Base):
    __tablename__ = "ExplicacionLlm"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analisis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("Analisis.id", ondelete="RESTRICT", onupdate="CASCADE"),
        unique=True,
    )
    estado: Mapped[EstadoExplicacion] = mapped_column(
        ENUM(EstadoExplicacion, name="EstadoExplicacion", create_type=True),
        server_default=text("'PENDIENTE'"),
    )
    texto: Mapped[str | None] = mapped_column(Text, nullable=True)
    # El JSON exacto que se le mandó a Gemini, sin imagen. Pa reintentar (ANA-04) y pa auditar
    datos_enviados: Mapped[Any] = mapped_column(JSONB)
    modelo_llm: Mapped[str] = mapped_column(Text)
    latencia_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    intentos: Mapped[int] = mapped_column(Integer, server_default=text("1"))  # máximo 3 (ANA-04)
    codigo_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    generada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    analisis: Mapped[Analisis] = relationship(back_populates="explicacion")


class ObservacionProfesional(Base):
    __tablename__ = "ObservacionProfesional"
    # Una observación por doctor y análisis; el que recibe un traslado agrega la suya (RF-A07 CA 3)
    __table_args__ = (
        UniqueConstraint(
            "analisis_id", "autor_id", name="ObservacionProfesional_analisis_id_autor_id_key"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    analisis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("Analisis.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    autor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("Usuario.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    valoracion: Mapped[Valoracion] = mapped_column(
        ENUM(Valoracion, name="Valoracion", create_type=True)
    )
    texto: Mapped[str | None] = mapped_column(Text, nullable=True)
    registrada_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    analisis: Mapped[Analisis] = relationship(back_populates="observaciones")
    autor: Mapped[Usuario] = relationship(back_populates="observaciones")
