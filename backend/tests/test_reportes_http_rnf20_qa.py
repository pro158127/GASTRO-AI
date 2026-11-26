"""RF-H02 #111: contrato HTTP de descarga, con sesión y servicio simulados."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routers import reportes as controlador
from app.core.errores import registrar_manejadores
from app.models import CodigoRol, EstadoUsuario, EtapaSesion
from app.services.autenticacion import ReglasSesion, ServicioAutenticacion

DOCTOR_ID = UUID(int=61)
REPORTE_ID = UUID(int=62)
AHORA = datetime.now(UTC)


def test_descarga_http_envia_pdf_sin_cache_y_nombre_seguro():
    doctor = SimpleNamespace(
        id=DOCTOR_ID,
        estado=EstadoUsuario.ACTIVO,
        bloqueado_hasta=None,
        rol=SimpleNamespace(codigo=CodigoRol.DOCTOR),
    )
    sesion = SimpleNamespace(
        usuario=doctor,
        etapa=EtapaSesion.ACTIVA,
        cerrada_en=None,
        ultima_actividad_en=AHORA - timedelta(minutes=2),
        ip=None,
    )
    repo_sesiones = Mock()
    repo_sesiones.por_token_hash.return_value = sesion
    autenticacion = ServicioAutenticacion(
        Mock(), repo_sesiones, Mock(), Mock(), Mock(), Mock(),
        reglas=ReglasSesion(), reloj=lambda: AHORA,
    )
    servicio = Mock()
    servicio.descargar.return_value = (b"%PDF-sintetico", "Reporte_GastroAI_A-0062.pdf")
    app = FastAPI()
    registrar_manejadores(app)
    app.include_router(controlador.router, prefix="/api/v1")
    app.dependency_overrides[deps.get_servicio_autenticacion] = lambda: autenticacion
    app.dependency_overrides[deps.get_servicio_reportes] = lambda: servicio

    with TestClient(app, base_url="https://testserver") as cliente:
        cliente.cookies.set("gastro_sesion", "token-sintetico")
        respuesta = cliente.get(f"/api/v1/reportes/{REPORTE_ID}/archivo")

    assert respuesta.status_code == 200 and respuesta.content == b"%PDF-sintetico"
    assert respuesta.headers["content-type"] == "application/pdf"
    assert respuesta.headers["cache-control"] == "no-store"
    assert respuesta.headers["content-disposition"] == (
        'attachment; filename="Reporte_GastroAI_A-0062.pdf"'
    )
    servicio.descargar.assert_called_once_with(DOCTOR_ID, REPORTE_ID)
