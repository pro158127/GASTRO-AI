"""Paginación del contrato: ?pagina=1&por_pagina=20 → {"items": [...], "paginacion": {...}}."""

from pydantic import BaseModel, Field

POR_PAGINA_MAXIMO = 100


class Paginacion(BaseModel):
    pagina: int = Field(examples=[1])
    por_pagina: int = Field(examples=[20])
    total: int = Field(examples=[17])
