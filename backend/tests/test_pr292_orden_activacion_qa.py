"""Pruebas HTTP aisladas U-17 - PR #292."""
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace as NS
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routers.admin_usuarios import router
from app.core.errores import registrar_manejadores
from app.models import CodigoRol, EstadoUsuario, EtapaSesion
from app.services.autenticacion import ReglasSesion, ServicioAutenticacion

AHORA = datetime(2026, 11, 21, 12, tzinfo=UTC)


@pytest.fixture
def entorno():
    usuario = NS(
        id=UUID(int=1),
        estado=EstadoUsuario.ACTIVO,
        bloqueado_hasta=None,
        rol=NS(codigo=CodigoRol.ADMINISTRADOR),
    )
    sesion = NS(
        usuario=usuario,
        etapa=EtapaSesion.ACTIVA,
        cerrada_en=None,
        ultima_actividad_en=AHORA - timedelta(minutes=5),
        ip=None,
    )

    repo, unidad, eventos = Mock(), Mock(), Mock()
    repo.por_token_hash.return_value = sesion

    auth = ServicioAutenticacion(
        Mock(), repo, eventos, unidad, Mock(), Mock(),
        reglas=ReglasSesion(),
        reloj=lambda: AHORA,
    )

    servicio = Mock()
    servicio.listar.return_value = ([], 0)

    extras = Mock()
    extras.ultimos_envios.return_value = {}
    extras.conteos.return_value = NS(
        activos=0,
        pendientes=0,
        expiradas=0,
        inactivos=0,
        bloqueadas=0,
        eliminadas=0,
    )

    app = FastAPI()
    registrar_manejadores(app)
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[deps.get_servicio_autenticacion] = lambda: auth
    app.dependency_overrides[deps.get_servicio_usuarios] = lambda: servicio
    app.dependency_overrides[deps.get_servicio_resumen_cuentas] = lambda: extras

    with TestClient(
        app, base_url="https://testserver",
        raise_server_exceptions=False
    ) as cliente:
        cliente.cookies.set("gastro_sesion", "token-sintetico")
        yield NS(c=cliente, u=usuario, servicio=servicio)


@pytest.mark.parametrize("orden", ["activacion", "-activacion"])
def test_orden_activacion_aceptado(entorno, orden):
    e = entorno
    r = e.c.get(
        "/api/v1/admin/usuarios",
        params={"estado": "PENDIENTE", "orden": orden},
    )

    assert r.status_code == 200, r.text
    assert r.json()["items"] == []

    filtro = e.servicio.listar.call_args.args[0]
    assert filtro.orden == orden
    assert filtro.estado == EstadoUsuario.PENDIENTE


def test_orden_incorrecto_rechazado(entorno):
    e = entorno
    r = e.c.get("/api/v1/admin/usuarios?orden=incorrecto")

    assert r.status_code == 422
    assert r.json()["error"]["codigo"] == "DATOS_INVALIDOS"
    e.servicio.listar.assert_not_called()


def test_sin_sesion_rechazado(entorno):
    e = entorno
    e.c.cookies.clear()

    r = e.c.get("/api/v1/admin/usuarios?orden=activacion")

    assert r.status_code == 401
    assert r.json()["error"]["codigo"] == "SESION_EXPIRADA"
    e.servicio.listar.assert_not_called()


def test_doctor_no_puede_listar_usuarios(entorno):
    e = entorno
    e.u.rol.codigo = CodigoRol.DOCTOR

    r = e.c.get("/api/v1/admin/usuarios?orden=activacion")

    assert r.status_code == 403
    assert r.json()["error"]["codigo"] == "PERMISO_DENEGADO"
    e.servicio.listar.assert_not_called()