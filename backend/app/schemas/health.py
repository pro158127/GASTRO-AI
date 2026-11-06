"""Esquemas Pydantic: la forma exacta del JSON que le llega al front.

Si le cambias un campo aquí, avísale al del front antes, o se le rompe la pantalla.
"""

from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "error"]
