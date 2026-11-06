"""Módulo 1 · Usuarios y acceso: roles, cuentas, sesiones y envíos de credenciales."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:  # solo pa los tipos; en runtime SQLAlchemy los resuelve por nombre
    from app.models.analisis import Analisis, CasoPaciente, ObservacionProfesional
    from app.models.auditoria import Bitacora, Traslado
    from app.models.modelo import ConfiguracionInferencia
    from app.models.reportes import Reporte


class CodigoRol(enum.StrEnum):
    DOCTOR = "DOCTOR"
    ADMINISTRADOR = "ADMINISTRADOR"


class EstadoUsuario(enum.StrEnum):
    PENDIENTE = "PENDIENTE"
    ACTIVO = "ACTIVO"
    INACTIVO = "INACTIVO"
    ELIMINADO = "ELIMINADO"


class EtapaSesion(enum.StrEnum):
    PENDIENTE_2FA = "PENDIENTE_2FA"
    CAMBIO_CONTRASENA = "CAMBIO_CONTRASENA"
    VINCULAR_TOTP = "VINCULAR_TOTP"
    ACTIVA = "ACTIVA"


class MotivoCredencial(enum.StrEnum):
    CREACION = "CREACION"
    RESTABLECIMIENTO = "RESTABLECIMIENTO"
    CAMBIO_CORREO = "CAMBIO_CORREO"


class EstadoEnvio(enum.StrEnum):
    ENVIADO = "ENVIADO"
    FALLIDO = "FALLIDO"


class Rol(Base):
    __tablename__ = "Rol"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    codigo: Mapped[CodigoRol] = mapped_column(
        ENUM(CodigoRol, name="CodigoRol", create_type=True), unique=True
    )
    nombre: Mapped[str] = mapped_column(Text)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)

    usuarios: Mapped[list[Usuario]] = relationship(back_populates="rol")


class Usuario(Base):
    __tablename__ = "Usuario"
    __table_args__ = (Index("Usuario_estado_rol_id_idx", "estado", "rol_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rol_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("Rol.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    nombre: Mapped[str] = mapped_column(Text)
    apellido: Mapped[str] = mapped_column(Text)
    # Correo y hash solo quedan en null cuando la cuenta está ELIMINADA (CHECK en 0002)
    correo: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    telefono: Mapped[str | None] = mapped_column(Text, nullable=True)
    hash_contrasena: Mapped[str | None] = mapped_column(Text, nullable=True)
    contrasena_temporal: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    temporal_expira_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Va cifrado con AES-256-GCM; la llave vive en TOTP_CLAVE_CIFRADO, nunca aquí
    totp_secreto_cifrado: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    totp_vinculado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Último paso TOTP aceptado: así el mismo código no se usa dos veces (RF-U01 CA 7)
    totp_ultimo_paso: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    intentos_fallidos: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    bloqueado_hasta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estado: Mapped[EstadoUsuario] = mapped_column(
        ENUM(EstadoUsuario, name="EstadoUsuario", create_type=True),
        server_default=text("'PENDIENTE'"),
    )
    creado_por: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("Usuario.id", ondelete="SET NULL", onupdate="CASCADE"),
        nullable=True,
    )
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    activado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    eliminado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    rol: Mapped[Rol] = relationship(back_populates="usuarios")
    # Autorreferencia: quién creó la cuenta. El remote_side es lo que la hace funcionar
    creador: Mapped[Usuario | None] = relationship(
        foreign_keys=[creado_por], remote_side=[id], back_populates="cuentas_creadas"
    )
    cuentas_creadas: Mapped[list[Usuario]] = relationship(
        foreign_keys=[creado_por], back_populates="creador"
    )
    sesiones: Mapped[list[Sesion]] = relationship(back_populates="usuario")
    envios_credencial: Mapped[list[EnvioCredencial]] = relationship(back_populates="usuario")
    casos_asignados: Mapped[list[CasoPaciente]] = relationship(back_populates="doctor_asignado")
    analisis_ejecutados: Mapped[list[Analisis]] = relationship(back_populates="doctor_ejecutor")
    observaciones: Mapped[list[ObservacionProfesional]] = relationship(back_populates="autor")
    reportes: Mapped[list[Reporte]] = relationship(back_populates="doctor")
    entradas_bitacora: Mapped[list[Bitacora]] = relationship(back_populates="actor")
    traslados_como_origen: Mapped[list[Traslado]] = relationship(
        foreign_keys="[Traslado.origen_id]", back_populates="origen"
    )
    traslados_como_destino: Mapped[list[Traslado]] = relationship(
        foreign_keys="[Traslado.destino_id]", back_populates="destino"
    )
    traslados_ejecutados: Mapped[list[Traslado]] = relationship(
        foreign_keys="[Traslado.ejecutado_por]", back_populates="ejecutor"
    )
    config_actualizada: Mapped[list[ConfiguracionInferencia]] = relationship(
        back_populates="actualizador"
    )


class Sesion(Base):
    __tablename__ = "Sesion"
    __table_args__ = (Index("Sesion_usuario_id_cerrada_en_idx", "usuario_id", "cerrada_en"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("Usuario.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    # Solo el SHA-256 del token; el token de verdad vive en la cookie y en ningún otro lado
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    etapa: Mapped[EtapaSesion] = mapped_column(
        ENUM(EtapaSesion, name="EtapaSesion", create_type=True),
        server_default=text("'PENDIENTE_2FA'"),
    )
    creada_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ultima_actividad_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    cerrada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip: Mapped[str | None] = mapped_column(Text, nullable=True)

    usuario: Mapped[Usuario] = relationship(back_populates="sesiones")


class EnvioCredencial(Base):
    """Cada intento de mandar la contraseña temporal por correo, salga bien o mal.

    Sirve pa reintentar si el SMTP falló (RF-U05 CA 9), pa la lista de pendientes (RF-U06),
    los restablecimientos (RF-U09) y la exportación de auditoría (RF-DB02 CA 7).
    """

    __tablename__ = "EnvioCredencial"
    __table_args__ = (
        Index("EnvioCredencial_usuario_id_intentado_en_idx", "usuario_id", "intentado_en"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("Usuario.id", ondelete="RESTRICT", onupdate="CASCADE")
    )
    motivo: Mapped[MotivoCredencial] = mapped_column(
        ENUM(MotivoCredencial, name="MotivoCredencial", create_type=True)
    )
    estado: Mapped[EstadoEnvio] = mapped_column(
        ENUM(EstadoEnvio, name="EstadoEnvio", create_type=True)
    )
    codigo_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    intentado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    usuario: Mapped[Usuario] = relationship(back_populates="envios_credencial")
