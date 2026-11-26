"""Contrato HTTP de cuentas pendientes y expiradas (RF-U06 #89, RNF-20 #139)."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routers.admin_usuarios import router
from app.core.errores import registrar_manejadores
from app.models import CodigoRol, EstadoEnvio, EstadoUsuario, EtapaSesion, MotivoCredencial
from app.services.autenticacion import ReglasSesion, ServicioAutenticacion

AHORA = datetime.now(UTC)


def cuenta(numero: int, estado: EstadoUsuario, expira: datetime) -> SimpleNamespace:
    return SimpleNamespace(
        id=UUID(int=numero),
        nombre=f"Cuenta {numero}",
        apellido="Sintética",
        correo=f"cuenta{numero}@example.invalid",
        telefono=None,
        rol=SimpleNamespace(codigo=CodigoRol.DOCTOR, nombre="Doctor"),
        estado=estado,
        bloqueado_hasta=None,
        creado_en=AHORA - timedelta(hours=80),
        activado_en=AHORA if estado is EstadoUsuario.ACTIVO else None,
        temporal_expira_en=expira,
        hash_contrasena="hash-sintetico-no-real",
    )


@pytest.fixture
def entorno():
    administrador = SimpleNamespace(
        id=UUID(int=100),
        estado=EstadoUsuario.ACTIVO,
        bloqueado_hasta=None,
        rol=SimpleNamespace(codigo=CodigoRol.ADMINISTRADOR),
    )
    sesion = SimpleNamespace(
        usuario=administrador,
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
    servicio, extras = Mock(), Mock()
    extras.ultimos_envios.return_value = {}
    extras.conteos.return_value = SimpleNamespace(
        activos=0, pendientes=0, expiradas=0, inactivos=0, bloqueadas=0, eliminadas=0
    )
    app = FastAPI()
    registrar_manejadores(app)
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[deps.get_servicio_autenticacion] = lambda: autenticacion
    app.dependency_overrides[deps.get_servicio_usuarios] = lambda: servicio
    app.dependency_overrides[deps.get_servicio_resumen_cuentas] = lambda: extras
    with TestClient(app, base_url="https://testserver", raise_server_exceptions=False) as cliente:
        cliente.cookies.set("gastro_sesion", "token-sintetico")
        yield SimpleNamespace(cliente=cliente, servicio=servicio, extras=extras)


def test_lista_distingue_temporal_expirada_y_vigente_sin_exponer_hash(entorno):
    expirada = cuenta(1, EstadoUsuario.PENDIENTE, AHORA - timedelta(minutes=1))
    vigente = cuenta(2, EstadoUsuario.PENDIENTE, AHORA + timedelta(hours=72))
    envio_fallido = SimpleNamespace(
        motivo=MotivoCredencial.CREACION,
        estado=EstadoEnvio.FALLIDO,
        intentado_en=AHORA - timedelta(hours=80),
        codigo_error="CORREO_NO_ENVIADO",
    )
    entorno.servicio.listar.return_value = ([expirada, vigente], 2)
    entorno.extras.ultimos_envios.return_value = {expirada.id: envio_fallido}
    entorno.extras.conteos.return_value = SimpleNamespace(
        activos=0, pendientes=1, expiradas=1, inactivos=0, bloqueadas=0, eliminadas=0
    )

    respuesta = entorno.cliente.get("/api/v1/admin/usuarios?estado=PENDIENTE")

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["conteos"]["expiradas"] == 1
    assert datos["conteos"]["pendientes"] == 1
    assert [u["estado_activacion"] for u in datos["items"]] == ["EXPIRADA", "PENDIENTE"]
    assert datos["items"][0]["ultimo_envio"]["estado"] == "FALLIDO"
    assert datos["items"][0]["ultimo_envio"]["codigo_error"] == "CORREO_NO_ENVIADO"
    assert datos["items"][1]["ultimo_envio"] is None
    assert all("hash_contrasena" not in u for u in datos["items"])


def test_cuenta_activada_no_presenta_vencimiento_temporal_anterior(entorno):
    activada = cuenta(3, EstadoUsuario.ACTIVO, AHORA - timedelta(days=2))
    entorno.servicio.listar.return_value = ([activada], 1)
    entorno.extras.conteos.return_value = SimpleNamespace(
        activos=1, pendientes=0, expiradas=0, inactivos=0, bloqueadas=0, eliminadas=0
    )

    respuesta = entorno.cliente.get("/api/v1/admin/usuarios?estado=ACTIVO")

    assert respuesta.status_code == 200
    usuario = respuesta.json()["items"][0]
    assert usuario["estado_activacion"] is None
    assert usuario["temporal_expira_en"] is None
    assert usuario["activado_en"] is not None


def test_casos_activos_entrega_solo_datos_tecnicos_no_clinicos(entorno):
    doctor_id = UUID(int=4)
    caso = SimpleNamespace(
        caso_id=UUID(int=5),
        analisis=[SimpleNamespace(
            id=UUID(int=6),
            codigo="A-2026-000006",
            solicitado_en=AHORA,
            resultado="dato-clinico-sintetico-no-debe-salir",
        )],
        documento_paciente="dato-sintetico-no-debe-salir",
    )
    entorno.extras.casos_activos.return_value = [caso]

    respuesta = entorno.cliente.get(f"/api/v1/admin/usuarios/{doctor_id}/casos-activos")

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["total_casos"] == 1
    assert datos["total_analisis"] == 1
    assert set(datos["casos"][0]) == {"caso_id", "analisis"}
    assert set(datos["casos"][0]["analisis"][0]) == {
        "id", "codigo", "solicitado_en"
    }
    assert datos["casos"][0]["analisis"][0]["codigo"] == "A-2026-000006"
    entorno.extras.casos_activos.assert_called_once_with(doctor_id)
