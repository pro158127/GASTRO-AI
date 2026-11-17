"""Controlador: recibe la petición del front, le pasa el chisme al servicio y responde.

Nada de SQL ni de lógica aquí: este solo hace de mesero.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_health_service
from app.schemas.health import HealthResponse
from app.services.health_service import HealthService

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=HealthResponse)
def health(service: Annotated[HealthService, Depends(get_health_service)]) -> dict[str, str]:
    return service.check()
