"""Pruebas aisladas del catálogo de roles U-16, PR #292."""
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace as NS
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routers.catalogos import router
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
        rol=NS(codigo=CodigoRol.DOCTOR),
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

    catalogo = Mock()
    catalogo.roles.return_value = [
        NS(codigo=CodigoRol.DOCTOR, nombre="Doctor/Gastroenterólogo"),
        NS(codigo=CodigoRol.ADMINISTRADOR, nombre="Administrador"),
    ]

    app = FastAPI()
    registrar_manejadores(app)
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[deps.get_servicio_autenticacion] = lambda: auth
    app.dependency_overrides[deps.get_catalogo] = lambda: catalogo

    with TestClient(app, base_url="https://testserver",
                    raise_server_exceptions=False) as cliente:
        yield cliente, catalogo


def test_catalogo_roles_con_sesion_activa(entorno):
    cliente, catalogo = entorno
    cliente.cookies.set("gastro_sesion", "token-sintetico")

    respuesta = cliente.get("/api/v1/catalogos/roles")

    assert respuesta.status_code == 200
    assert respuesta.json() == {
        "items": [
            {"codigo": "DOCTOR", "nombre": "Doctor/Gastroenterólogo"},
            {"codigo": "ADMINISTRADOR", "nombre": "Administrador"},
        ]
    }
    catalogo.roles.assert_called_once()


def test_catalogo_roles_sin_sesion(entorno):
    cliente, catalogo = entorno

    respuesta = cliente.get("/api/v1/catalogos/roles")

    assert respuesta.status_code == 401
    assert respuesta.json()["error"]["codigo"] == "SESION_EXPIRADA"
    catalogo.roles.assert_not_called()