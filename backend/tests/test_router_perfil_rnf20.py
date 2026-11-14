"""RF-U04 / RNF-20: router real, servicios simulados, sin persistencia."""
import socket
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routers.perfil import router
from app.core.errores import ErrorApi, registrar_manejadores
from app.models import CodigoRol, EstadoUsuario, EtapaSesion


@pytest.fixture
def entorno(monkeypatch):
    def prohibida(*args, **kwargs):
        raise AssertionError("Conexion externa no permitida")
    usuario = SimpleNamespace(
        id=UUID(int=1), nombre="Persona", apellido="Sintetica",
        correo="qa@example.invalid", telefono=None,
        rol=SimpleNamespace(codigo=CodigoRol.DOCTOR, nombre="Doctor"),
        estado=EstadoUsuario.ACTIVO, creado_en=datetime(2026, 1, 1, tzinfo=UTC),
        totp_vinculado_en=None, secreto_no_publicable="dato-sintetico",
    )
    auth, servicio = Mock(), Mock()
    auth.validar_sesion.return_value = SimpleNamespace(usuario=usuario)
    servicio.editar.return_value = usuario
    app = FastAPI()
    registrar_manejadores(app)
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[deps.get_servicio_autenticacion] = lambda: auth
    app.dependency_overrides[deps.get_servicio_perfil] = lambda: servicio
    app.dependency_overrides[deps.ip_cliente] = lambda: "127.0.0.1"
    with TestClient(app, raise_server_exceptions=False) as cliente:
        # Windows necesita su socketpair interno al iniciar el bucle de asyncio.
        # Bloquear conexiones durante las peticiones, tras iniciar el portal ASGI.
        with monkeypatch.context() as red:
            red.setattr(socket.socket, "connect", prohibida)
            red.setattr(socket.socket, "connect_ex", prohibida)
            red.setattr(socket, "create_connection", prohibida)
            yield cliente, usuario, auth, servicio
    app.dependency_overrides.clear()


@pytest.mark.parametrize("rol", [CodigoRol.DOCTOR, CodigoRol.ADMINISTRADOR])
@pytest.mark.parametrize("vinculado", [False, True])
def test_ver_perfil_ambos_roles_y_estado_totp(entorno, rol, vinculado):
    cliente, usuario, auth, servicio = entorno
    usuario.rol.codigo = rol
    usuario.totp_vinculado_en = usuario.creado_en if vinculado else None
    respuesta = cliente.get("/api/v1/perfil")
    assert respuesta.status_code == 200
    assert respuesta.json() == {
        "id": str(usuario.id), "nombre": "Persona", "apellido": "Sintetica",
        "correo": "qa@example.invalid", "telefono": None,
        "rol": {"codigo": rol.value, "nombre": "Doctor"}, "estado": "ACTIVO",
        "creado_en": "2026-01-01T00:00:00Z", "totp_vinculado": vinculado,
    }
    auth.validar_sesion.assert_called_once_with(None, (EtapaSesion.ACTIVA,), False)
    servicio.editar.assert_not_called()


def test_edicion_normaliza_y_devuelve_resultado_servicio(entorno):
    cliente, usuario, _, servicio = entorno
    actualizado = SimpleNamespace(**vars(usuario))
    actualizado.nombre = "Nuevo"
    servicio.editar.return_value = actualizado
    respuesta = cliente.patch("/api/v1/perfil", json={"nombre": " Nuevo ", "telefono": "+123 456-7890"})
    assert respuesta.status_code == 200
    assert respuesta.json()["nombre"] == "Nuevo"
    persona, cambios, ip = servicio.editar.call_args.args
    assert persona is usuario and ip == "127.0.0.1"
    assert cambios.nombre == "Nuevo" and cambios.telefono == "+1234567890"
    assert cambios.borrar_telefono is False


@pytest.mark.parametrize("entrada,borrar", [({}, False), ({"telefono": None}, True)])
def test_distingue_telefono_omitido_de_borrado(entorno, entrada, borrar):
    cliente, _, _, servicio = entorno
    assert cliente.patch("/api/v1/perfil", json=entrada).status_code == 200
    assert servicio.editar.call_args.args[1].borrar_telefono is borrar


def test_no_transfiere_correo_ni_rol_editables(entorno):
    cliente, usuario, _, servicio = entorno
    respuesta = cliente.patch("/api/v1/perfil", json={"correo": "otro@example.invalid", "rol": "ADMINISTRADOR"})
    assert respuesta.status_code == 200
    cambios = servicio.editar.call_args.args[1]
    assert cambios.correo is None
    assert not hasattr(cambios, "rol")
    assert respuesta.json()["correo"] == usuario.correo
    assert respuesta.json()["rol"]["codigo"] == "DOCTOR"


@pytest.mark.parametrize("entrada", [{"nombre": " "}, {"apellido": "x" * 101}, {"telefono": "NO-TELEFONO-SINTETICO"}])
def test_entrada_invalida_no_invoca_servicio(entorno, entrada):
    cliente, _, _, servicio = entorno
    respuesta = cliente.patch("/api/v1/perfil", json=entrada)
    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["codigo"] == "DATOS_INVALIDOS"
    assert respuesta.json()["error"]["campos"][0]["campo"] == next(iter(entrada))
    servicio.editar.assert_not_called()


@pytest.mark.parametrize("metodo", ["get", "patch"])
@pytest.mark.parametrize("estado,codigo", [(401, "SESION_EXPIRADA"), (403, "ETAPA_INVALIDA")])
def test_rechazo_autenticacion_impide_operacion(entorno, metodo, estado, codigo):
    cliente, _, auth, servicio = entorno
    auth.validar_sesion.side_effect = ErrorApi(estado, codigo, "Rechazo simulado")
    respuesta = cliente.request(metodo, "/api/v1/perfil", **({"json": {"nombre": "Nuevo"}} if metodo == "patch" else {}))
    assert respuesta.status_code == estado
    assert respuesta.json()["error"]["codigo"] == codigo
    servicio.editar.assert_not_called()


def test_error_servicio_conserva_codigo_controlado(entorno):
    cliente, _, _, servicio = entorno
    servicio.editar.side_effect = ErrorApi(422, "DATOS_INVALIDOS", "Error simulado")
    respuesta = cliente.patch("/api/v1/perfil", json={"nombre": "Nuevo"})
    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["codigo"] == "DATOS_INVALIDOS"


def test_error_inesperado_no_expone_detalle(entorno):
    cliente, _, _, servicio = entorno
    servicio.editar.side_effect = RuntimeError("detalle-interno-sintetico")
    respuesta = cliente.patch("/api/v1/perfil", json={"nombre": "Nuevo"})
    assert respuesta.status_code == 500
    assert respuesta.json()["error"]["codigo"].startswith("ERR-")
    assert "detalle-interno-sintetico" not in respuesta.text
