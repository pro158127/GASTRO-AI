"""Módulo 5 · Auditoría y trazabilidad: bitácora, logs de inferencia y traslados de casos."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, Text, func
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.analisis import Analisis, CasoPaciente
    from app.models.modelo import ModeloDesplegado
    from app.models.usuarios import Usuario


class EstadoInferencia(enum.StrEnum):
    EXITO = "EXITO"
    ERROR = "ERROR"
    TIEMPO_AGOTADO = "TIEMPO_AGOTADO"


class TipoTraslado(enum.StrEnum):
    DESACTIVACION = "DESACTIVACION"
    ELIMINACION = "ELIMINACION"


class ResultadoAccion(enum.StrEnum):  # RF-DB02 CA 10
    EXITO = "EXITO"
    FALLO = "FALLO"


class AccionBitacora(enum.StrEnum):
    """Lista cerrada de lo que se anota en la bitácora (RF-A02, RNF-05).

    Acción nueva = valor nuevo aquí + migración, porque es un enum de Postgres.
    """

    INICIO_SESION = "INICIO_SESION"
    VERIFICACION_2FA = "VERIFICACION_2FA"
    CIERRE_SESION = "CIERRE_SESION"
    CIERRE_SESION_INACTIVIDAD = "CIERRE_SESION_INACTIVIDAD"
    CAMBIO_CONTRASENA_TEMPORAL = "CAMBIO_CONTRASENA_TEMPORAL"
    VINCULACION_TOTP = "VINCULACION_TOTP"
    CUENTA_CREADA = "CUENTA_CREADA"
    CUENTA_EDITADA = "CUENTA_EDITADA"
    CORREO_CAMBIADO = "CORREO_CAMBIADO"
    CUENTA_ACTIVADA = "CUENTA_ACTIVADA"
    CUENTA_DESACTIVADA = "CUENTA_DESACTIVADA"
    CUENTA_ELIMINADA = "CUENTA_ELIMINADA"
    CONTRASENA_RESTABLECIDA = "CONTRASENA_RESTABLECIDA"
    ROL_CAMBIADO = "ROL_CAMBIADO"
    CUENTA_BLOQUEADA = "CUENTA_BLOQUEADA"
    CUENTA_DESBLOQUEADA = "CUENTA_DESBLOQUEADA"
    ENVIO_CREDENCIAL = "ENVIO_CREDENCIAL"
    CASOS_REASIGNADOS = "CASOS_REASIGNADOS"
    CONFIGURACION_INFERENCIA_CAMBIADA = "CONFIGURACION_INFERENCIA_CAMBIADA"
    AUDITORIA_EXPORTADA = "AUDITORIA_EXPORTADA"


class Bitacora(Base):
    """La bitácora inmutable (RNF-05): solo INSERT y SELECT.

    Los triggers de 0002 truenan con UPDATE, DELETE o TRUNCATE. Y en «detalle» jamás va un
    seudónimo, un documento ni un resultado clínico.
    """

    __tablename__ = "Bitacora"
    __table_args__ = (
        Index("Bitacora_ocurrido_en_idx", "ocurrido_en"),
        Index("Bitacora_actor_id_ocurrido_en_idx", "actor_id", "ocurrido_en"),
        Index("Bitacora_accion_ocurrido_en_idx", "accion", "ocurrido_en"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("Usuario.id", ondelete="SET NULL", onupdate="CASCADE"),
        nullable=True,
    )
    accion: Mapped[AccionBitacora] = mapped_column(
        ENUM(AccionBitacora, name="AccionBitacora", create_type=True)
    )
    resultado: Mapped[ResultadoAccion] = mapped_column(
        ENUM(ResultadoAccion, name="ResultadoAccion", create_type=True)
    )
    entidad: Mapped[str | None] = mapped_column(Text, nullable=True)
    entidad_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    detalle: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    ip: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocurrido_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    actor: Mapped[Usuario | None] = relationship(back_populates="entradas_bitacora")


class LogInferencia(Base):
    """Log técnico de cada inferencia: tiempos y estado, cero datos clínicos (RF-M03)."""

    __tablename__ = "LogInferencia"
    __table_args__ = (Index("LogInferencia_ocurrido_en_idx", "ocurrido_en"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # Uso interno nomás: la API del admin NO lo expone (RF-M03 CA 2)
    analisis_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("Analisis.id", ondelete="SET NULL", onupdate="CASCADE"),
        nullable=True,
    )
    modelo_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("ModeloDesplegado.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    estado: Mapped[EstadoInferencia] = mapped_column(
        ENUM(EstadoInferencia, name="EstadoInferencia", create_type=True)
    )
    latencia_vision_ms: Mapped[int] = mapped_column(Integer)
    latencia_llm_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    codigo_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocurrido_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    analisis: Mapped[Analisis | None] = relationship(back_populates="logs")
    modelo: Mapped[ModeloDesplegado] = relationship(back_populates="logs")


class Traslado(Base):
    """Cuando un doctor se va, sus casos pasan a otro y aquí queda el rastro (RF-A06, RF-U11)."""

    __tablename__ = "Traslado"
    __table_args__ = (Index("Traslado_destino_id_ejecutado_en_idx", "destino_id", "ejecutado_en"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tipo: Mapped[TipoTraslado] = mapped_column(
        ENUM(TipoTraslado, name="TipoTraslado", create_type=True)
    )
    # Origen y destino nunca son el mismo doctor (CHECK traslado_distinto en 0002)
    origen_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("Usuario.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    destino_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("Usuario.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    ejecutado_por: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("Usuario.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    ejecutado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # Cuando el doctor de destino lo abre deja de salir como «Nuevo» en el front (RF-A07)
    visto_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    origen: Mapped[Usuario] = relationship(
        foreign_keys=[origen_id], back_populates="traslados_como_origen"
    )
    destino: Mapped[Usuario] = relationship(
        foreign_keys=[destino_id], back_populates="traslados_como_destino"
    )
    ejecutor: Mapped[Usuario] = relationship(
        foreign_keys=[ejecutado_por], back_populates="traslados_ejecutados"
    )
    casos: Mapped[list[TrasladoCaso]] = relationship(back_populates="traslado")


class TrasladoCaso(Base):
    """Puente N:M entre traslados y casos."""

    __tablename__ = "TrasladoCaso"
    __table_args__ = (Index("TrasladoCaso_caso_id_idx", "caso_id"),)

    traslado_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("Traslado.id", ondelete="RESTRICT", onupdate="CASCADE"),
        primary_key=True,
    )
    caso_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("CasoPaciente.id", ondelete="RESTRICT", onupdate="CASCADE"),
        primary_key=True,
    )

    traslado: Mapped[Traslado] = relationship(back_populates="casos")
    caso: Mapped[CasoPaciente] = relationship(back_populates="traslados")
