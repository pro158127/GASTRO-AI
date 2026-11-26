"""Por aquí arranca todo. uvicorn app.main:app y a rezar."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.adapters.tiempo_real import PublicadorRedis
from app.api.deps import get_broker
from app.api.routers import (
    admin_bitacora,
    admin_dashboard,
    admin_monitoreo,
    admin_usuarios,
    analisis,
    auth,
    casos_recibidos,
    catalogos,
    configuracion,
    dashboard,
    eventos,
    health,
    imagenes,
    pacientes,
    perfil,
    reportes,
)
from app.core.config import get_settings
from app.core.errores import registrar_manejadores
from app.repositories import avisos_tiempo_real
from app.schemas.errores import RespuestaError

settings = get_settings()


@asynccontextmanager
async def ciclo_de_vida(_app: FastAPI):
    # Los cambios que se confirman en la base salen como avisos por Redis (SSE)
    avisos_tiempo_real.instalar(PublicadorRedis(settings.redis_url))
    yield
    await get_broker().detener()


# Todos los endpoints documentan el mismo error genérico; cada uno agrega los suyos
app = FastAPI(
    title=settings.app_name,
    lifespan=ciclo_de_vida,
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
app.include_router(admin_bitacora.router, prefix=settings.api_prefix)
app.include_router(admin_monitoreo.router, prefix=settings.api_prefix)
app.include_router(admin_dashboard.router, prefix=settings.api_prefix)
app.include_router(catalogos.router, prefix=settings.api_prefix)
app.include_router(pacientes.router, prefix=settings.api_prefix)
app.include_router(imagenes.router, prefix=settings.api_prefix)
app.include_router(analisis.router, prefix=settings.api_prefix)
app.include_router(casos_recibidos.router, prefix=settings.api_prefix)
app.include_router(configuracion.router, prefix=settings.api_prefix)
app.include_router(dashboard.router, prefix=settings.api_prefix)
app.include_router(eventos.router, prefix=settings.api_prefix)
app.include_router(reportes.router, prefix=settings.api_prefix)
