"""Contrato HTTP del avance del análisis con servicios simulados (RNF-20 #139)."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routers import analisis as controlador
from app.core.errores import registrar_manejadores
from app.models import (
    CausaCalidad,
    CodigoRol,
    EstadoAnalisis,
    EstadoUsuario,
    EtapaProceso,
    EtapaSesion,
)
from app.services.autenticacion import ReglasSesion, ServicioAutenticacion

DOCTOR_ID = UUID(int=15)
ANALISIS_ID = UUID(int=16)
AHORA = datetime.now(UTC)


@pytest.fixture
def entorno(monkeypatch):
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
    repo_sesiones, unidad, eventos = Mock(), Mock(), Mock()
    repo_sesiones.por_token_hash.return_value = sesion
    autenticacion = ServicioAutenticacion(
        Mock(), repo_sesiones, eventos, unidad, Mock(), Mock(),
        reglas=ReglasSesion(), reloj=lambda: AHORA,
    )
    servicio = Mock()
    monkeypatch.setattr(controlador, "get_settings", lambda: SimpleNamespace(api_prefix="/api/v1"))
    app = FastAPI()
    registrar_manejadores(app)
    app.include_router(controlador.router, prefix="/api/v1")
    app.dependency_overrides[deps.get_servicio_autenticacion] = lambda: autenticacion
    app.dependency_overrides[deps.get_servicio_analisis] = lambda: servicio
    with TestClient(app, base_url="https://testserver", raise_server_exceptions=False) as cliente:
        cliente.cookies.set("gastro_sesion", "token-sintetico")
        yield SimpleNamespace(cliente=cliente, servicio=servicio)


def analisis(estado: EstadoAnalisis, etapa: EtapaProceso | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=ANALISIS_ID,
        estado=estado,
        etapa_proceso=etapa,
        codigo_error=None,
        calidad_suficiente=None,
    )


def test_fallo_de_calidad_expone_causa_y_oculta_url_de_resultado(entorno):
    fallido = analisis(EstadoAnalisis.FALLIDO, EtapaProceso.CALIDAD)
    fallido.codigo_error = "ERR-1001"
    fallido.calidad_suficiente = False
    fallido.causas_calidad = [CausaCalidad.BORROSA]
    fallido.calidad_nitidez = Decimal("37.5")
    fallido.calidad_brillo = Decimal("120")
    fallido.calidad_saturados_pct = Decimal("0.02")
    entorno.servicio.obtener.return_value = SimpleNamespace(analisis=fallido)

    respuesta = entorno.cliente.get(f"/api/v1/analisis/{ANALISIS_ID}/estado")

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["estado"] == "FALLIDO"
    assert datos["codigo_error"] == "ERR-1001"
    assert datos["calidad"]["causas"] == ["BORROSA"]
    assert datos["calidad"]["nitidez"] == 37.5
    assert "resultado_url" not in datos
    assert [(e["codigo"], e["estado"]) for e in datos["etapas"][:2]] == [
        ("ANONIMIZAR", "LISTO"), ("CALIDAD", "ERROR")
    ]
    entorno.servicio.obtener.assert_called_once_with(DOCTOR_ID, ANALISIS_ID)


def test_completado_expone_url_y_omite_error_y_calidad(entorno):
    entorno.servicio.obtener.return_value = SimpleNamespace(
        analisis=analisis(EstadoAnalisis.COMPLETADO)
    )

    respuesta = entorno.cliente.get(f"/api/v1/analisis/{ANALISIS_ID}/estado")

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["estado"] == "COMPLETADO"
    assert datos["resultado_url"] == f"/api/v1/analisis/{ANALISIS_ID}"
    assert "codigo_error" not in datos
    assert "calidad" not in datos
    assert all(e["estado"] == "LISTO" for e in datos["etapas"])


def test_en_cola_muestra_etapas_pendientes_sin_resultado(entorno):
    entorno.servicio.obtener.return_value = SimpleNamespace(
        analisis=analisis(EstadoAnalisis.PROCESANDO)
    )

    respuesta = entorno.cliente.get(f"/api/v1/analisis/{ANALISIS_ID}/estado")

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["estado"] == "PROCESANDO"
    assert all(e["estado"] == "PENDIENTE" for e in datos["etapas"])
    assert "codigo_error" not in datos
    assert "calidad" not in datos
    assert "resultado_url" not in datos
