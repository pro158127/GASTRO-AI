import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AnalisisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    documento: str
    tipo_documento: str
    estado: str
    resultado: Optional[dict] = None
    explicacion: Optional[str] = None
    error: Optional[str] = None
    imagen_url: Optional[str] = None
    grad_cam_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
