from fastapi import FastAPI

from app.config import settings
from app.routers import analisis, auth, health, ws

app = FastAPI(title=settings.app_name)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(analisis.router, prefix="/api", tags=["analisis"])
app.include_router(ws.router, tags=["websocket"])
