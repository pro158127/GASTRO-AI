"""Por aquí arranca todo. uvicorn app.main:app y a rezar."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import (
    admin_usuarios,
    auth,
    catalogos,
    configuracion,
    health,
    pacientes,
    perfil,
)
from app.core.config import get_settings
from app.core.errores import registrar_manejadores
from app.schemas.errores import RespuestaError

settings = get_settings()

# Todos los endpoints documentan el mismo error genérico; cada uno agrega los suyos
app = FastAPI(
    title=settings.app_name,
    responses={500: {"model": RespuestaError, "description": "Error interno sin detalles"}},
)
registrar_manejadores(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(perfil.router, prefix=settings.api_prefix)
app.include_router(admin_usuarios.router, prefix=settings.api_prefix)
app.include_router(catalogos.router, prefix=settings.api_prefix)
app.include_router(pacientes.router, prefix=settings.api_prefix)
app.include_router(configuracion.router, prefix=settings.api_prefix)
