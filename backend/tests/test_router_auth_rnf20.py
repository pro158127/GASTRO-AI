"""Contratos HTTP RF-U01/RNF-20; reglas de negocio delegadas a mocks."""
import socket
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routers.auth import router
from app.core.errores import ErrorApi, registrar_manejadores
from app.models import CodigoRol, EtapaSesion


@pytest.fixture
def contexto(monkeypatch):
    usuario = SimpleNamespace(id=UUID(int=1), nombre="QA", apellido="Sintetico",
                              rol=SimpleNamespace(codigo=CodigoRol.DOCTOR))
    sesion = SimpleNamespace(usuario=usuario, etapa=EtapaSesion.ACTIVA,
                             ultima_actividad_en=datetime(2026, 1, 1, tzinfo=UTC))
    servicio = Mock()
    servicio.casos_recibidos_nuevos.return_value = 0
    servicio.validar_sesion.return_value = sesion
    servicio.ruta_inicial.return_value = "/doctor/dashboard"
    app = FastAPI()
    registrar_manejadores(app)
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[deps.get_servicio_autenticacion] = lambda: servicio
    app.dependency_overrides[deps.ip_cliente] = lambda: "127.0.0.1"
    def bloquear(*args, **kwargs):
        raise AssertionError("Conexion externa prohibida")
    with TestClient(app, base_url="https://testserver", raise_server_exceptions=False) as cliente:
        with monkeypatch.context() as red:
            red.setattr(socket.socket, "connect", bloquear)
            red.setattr(socket.socket, "connect_ex", bloquear)
            red.setattr(socket, "create_connection", bloquear)
            cliente.cookies.set("gastro_sesion", "token-sintetico")
            yield cliente, servicio, sesion
    app.dependency_overrides.clear()


def test_login_cookie_segura_y_sin_token_en_json(contexto):
    cliente, servicio, _ = contexto
    servicio.iniciar_sesion.return_value = SimpleNamespace(token="nuevo-sintetico", etapa=EtapaSesion.PENDIENTE_2FA)
    r = cliente.post("/api/v1/auth/login", json={"correo": "qa@example.invalid", "contrasena": "sintetica"})
    assert r.status_code == 200 and r.json() == {"etapa": "PENDIENTE_2FA"}
    cookie = r.headers["set-cookie"].lower()
    assert all(x in cookie for x in ["gastro_sesion=nuevo-sintetico", "httponly", "secure", "samesite=strict", "path=/"])
    assert "max-age" not in cookie and "expires" not in cookie
    servicio.iniciar_sesion.assert_called_once_with("qa@example.invalid", "sintetica", "127.0.0.1")


@pytest.mark.parametrize("estado,codigo", [(401, "AUTH_CREDENCIALES_INVALIDAS"), (403, "AUTH_TEMPORAL_EXPIRADA")])
def test_login_error_no_emite_cookie(contexto, estado, codigo):
    cliente, servicio, _ = contexto
    servicio.iniciar_sesion.side_effect = ErrorApi(estado, codigo, "Rechazo simulado")
    r = cliente.post("/api/v1/auth/login", json={"correo": "qa@example.invalid", "contrasena": "sintetica"})
    assert r.status_code == estado and r.json()["error"]["codigo"] == codigo
    assert "set-cookie" not in r.headers


@pytest.mark.parametrize("ruta,cuerpo,metodo", [
    ("login", {"correo": "x", "contrasena": "s"}, "iniciar_sesion"),
    ("login", {"correo": "qa@example.invalid", "contrasena": ""}, "iniciar_sesion"),
    ("contrasena/cambiar", {"contrasena_nueva": "s"}, "cambiar_temporal"),
    ("totp/verificar", {"codigo": ""}, "verificar_segundo_factor"),
    ("totp/vincular", {"codigo": "1" * 11}, "confirmar_vinculacion"),
    ("logout", {"motivo": "otro"}, "cerrar_sesion"),
])
def test_entrada_invalida_rechazada_antes_de_operacion(contexto, ruta, cuerpo, metodo):
    cliente, servicio, _ = contexto
    r = cliente.post("/api/v1/auth/" + ruta, json=cuerpo)
    assert r.status_code == 422 and r.json()["error"]["codigo"] == "DATOS_INVALIDOS"
    getattr(servicio, metodo).assert_not_called()


def test_cambio_temporal_delega_y_exige_etapa(contexto):
    cliente, servicio, sesion = contexto
    servicio.cambiar_temporal.return_value = EtapaSesion.VINCULAR_TOTP
    r = cliente.post("/api/v1/auth/contrasena/cambiar", json={"contrasena_nueva": "nueva-sintetica", "confirmacion": "nueva-sintetica"})
    assert r.status_code == 200 and r.json() == {"etapa": "VINCULAR_TOTP"}
    servicio.validar_sesion.assert_called_once_with("token-sintetico", (EtapaSesion.CAMBIO_CONTRASENA,), False)
    servicio.cambiar_temporal.assert_called_once_with(sesion, "nueva-sintetica", "nueva-sintetica", "127.0.0.1")


def test_inicio_totp_serializa_material_sintetico(contexto):
    cliente, servicio, sesion = contexto
    salida = {"otpauth_uri": "otpauth://totp/QA", "secreto_manual": "SINTETICO-NO-REAL", "qr_png_base64": "c2ludGV0aWNv"}
    servicio.generar_vinculacion.return_value = salida
    r = cliente.post("/api/v1/auth/totp/iniciar")
    assert r.status_code == 200 and r.json() == salida
    servicio.generar_vinculacion.assert_called_once_with(sesion)
    servicio.validar_sesion.assert_called_once_with("token-sintetico", (EtapaSesion.VINCULAR_TOTP,), False)


@pytest.mark.parametrize("ruta,metodo,etapa", [
    ("totp/vincular", "confirmar_vinculacion", EtapaSesion.VINCULAR_TOTP),
    ("totp/verificar", "verificar_segundo_factor", EtapaSesion.PENDIENTE_2FA),
])
def test_totp_ingreso_publico_y_etapa_exigida(contexto, ruta, metodo, etapa):
    cliente, servicio, sesion = contexto
    getattr(servicio, metodo).return_value = sesion.usuario
    r = cliente.post("/api/v1/auth/" + ruta, json={"codigo": "123456"})
    assert r.status_code == 200
    assert r.json() == {"etapa": "ACTIVA", "usuario": {"id": str(sesion.usuario.id), "nombre": "QA", "apellido": "Sintetico", "rol": "DOCTOR"}, "ruta_inicial": "/doctor/dashboard"}
    getattr(servicio, metodo).assert_called_once_with(sesion, "123456", "127.0.0.1")
    servicio.validar_sesion.assert_called_once_with("token-sintetico", (etapa,), False)
    assert "set-cookie" not in r.headers


@pytest.mark.parametrize("ruta,metodo,estado,codigo", [
    ("totp/vincular", "confirmar_vinculacion", 409, "TOTP_NO_INICIADO"),
    ("totp/vincular", "confirmar_vinculacion", 422, "TOTP_CODIGO_INVALIDO"),
    ("totp/verificar", "verificar_segundo_factor", 401, "TOTP_CODIGO_INVALIDO"),
])
def test_errores_totp_se_conservan(contexto, ruta, metodo, estado, codigo):
    cliente, servicio, _ = contexto
    getattr(servicio, metodo).side_effect = ErrorApi(estado, codigo, "Simulado")
    r = cliente.post("/api/v1/auth/" + ruta, json={"codigo": "123456"})
    assert r.status_code == estado and r.json()["error"]["codigo"] == codigo


def test_sesion_pasiva_serializa_inactividad(contexto):
    cliente, servicio, sesion = contexto
    servicio.inactividad.return_value = {"aviso_en_s": 540, "cierre_en_s": 600, "ultima_actividad_en": sesion.ultima_actividad_en}
    r = cliente.get("/api/v1/auth/sesion", headers={"X-Actividad-Pasiva": "1"})
    assert r.status_code == 200
    assert r.json()["inactividad"] == {"aviso_en_s": 540, "cierre_en_s": 600, "ultima_actividad_en": "2026-01-01T00:00:00Z"}
    servicio.validar_sesion.assert_called_once_with("token-sintetico", tuple(EtapaSesion), True)
    servicio.inactividad.assert_called_once_with(sesion)


def test_continuar_admite_etapa_actual_y_devuelve_fecha(contexto):
    cliente, servicio, _ = contexto
    r = cliente.post("/api/v1/auth/sesion/continuar")
    assert r.status_code == 200 and r.json() == {"ultima_actividad_en": "2026-01-01T00:00:00Z"}
    # En QA se admite ACTIVA; el backend entrante también acepta las etapas iniciales.
    servicio.validar_sesion.assert_called_once()
    token, etapas, pasiva = servicio.validar_sesion.call_args.args
    assert token == "token-sintetico" and pasiva is False
    assert etapas in {
        (EtapaSesion.ACTIVA,),
        (EtapaSesion.PENDIENTE_2FA, EtapaSesion.CAMBIO_CONTRASENA,
         EtapaSesion.VINCULAR_TOTP, EtapaSesion.ACTIVA),
    }


@pytest.mark.parametrize("estado,codigo", [(401, "SESION_EXPIRADA"), (403, "ETAPA_INVALIDA")])
def test_acceso_rechazado_no_ejecuta_cambio(contexto, estado, codigo):
    cliente, servicio, _ = contexto
    cliente.cookies.clear()
    servicio.validar_sesion.side_effect = ErrorApi(estado, codigo, "Simulado")
    r = cliente.post("/api/v1/auth/contrasena/cambiar", json={"contrasena_nueva": "s", "confirmacion": "s"})
    assert r.status_code == estado and r.json()["error"]["codigo"] == codigo
    servicio.cambiar_temporal.assert_not_called()
    servicio.validar_sesion.assert_called_once_with(None, (EtapaSesion.CAMBIO_CONTRASENA,), False)


@pytest.mark.parametrize("cuerpo,inactividad", [(None, False), ({"motivo": "manual"}, False), ({"motivo": "inactividad"}, True)])
def test_logout_pasivo_borra_cookie_y_no_tiene_cuerpo(contexto, cuerpo, inactividad):
    cliente, servicio, sesion = contexto
    r = cliente.post("/api/v1/auth/logout", **({"json": cuerpo} if cuerpo is not None else {}))
    assert r.status_code == 204 and r.content == b""
    servicio.validar_sesion.assert_called_once_with("token-sintetico", tuple(EtapaSesion), pasiva=True)
    servicio.cerrar_sesion.assert_called_once_with(sesion, inactividad, "127.0.0.1")
    cookie = r.headers["set-cookie"].lower()
    assert all(x in cookie for x in ["max-age=0", "httponly", "secure", "samesite=strict", "path=/"])


@pytest.mark.parametrize("estado", [401, 403])
def test_logout_tolera_solo_sesion_expirada(contexto, estado):
    cliente, servicio, _ = contexto
    servicio.validar_sesion.side_effect = ErrorApi(estado, "SIMULADO", "Simulado")
    r = cliente.post("/api/v1/auth/logout")
    assert r.status_code == (204 if estado == 401 else 403)
    assert ("set-cookie" in r.headers) is (estado == 401)
    servicio.cerrar_sesion.assert_not_called()
