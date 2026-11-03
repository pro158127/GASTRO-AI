import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Analisis(Base):
    __tablename__ = "analisis"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    documento: Mapped[str] = mapped_column(String(50), nullable=False)
    tipo_documento: Mapped[str] = mapped_column(
        String(20), nullable=False, default="CC"
    )
    estado: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PROCESANDO"
    )
    imagen_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    grad_cam_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    resultado: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    explicacion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
