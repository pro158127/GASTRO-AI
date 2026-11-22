"""RNF-20/#208: pruebas HTTP aisladas del controlador de imagenes."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace as NS
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routers.imagenes import router, nombre_visible
from app.core.errores import ErrorApi, registrar_manejadores
from app.models import CodigoRol, EstadoUsuario, EtapaSesion
from app.services.autenticacion import ServicioAutenticacion, ReglasSesion
from app.services.verificadores_imagen import PESO_MAXIMO_BYTES


AHORA = datetime(2026, 11, 22, 12, tzinfo=UTC)


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

    repo = Mock()
    repo.por_token_hash.return_value = sesion

    auth = ServicioAutenticacion(
        Mock(), repo, Mock(), Mock(), Mock(), Mock(),
        reglas=ReglasSesion(),
        reloj=lambda: AHORA,
    )

    servicio = Mock()
    servicio.cargar.return_value = NS(
        imagen_id="tmp_" + "0" * 26,
        formato=NS(value="PNG"),
        ancho=224,
        alto=224,
        peso_bytes=20,
        sha256="a" * 64,
        expira_en=AHORA + timedelta(minutes=15),
    )

    app = FastAPI()
    registrar_manejadores(app)
    app.include_router(router, prefix="/api/v1")

    app.dependency_overrides[
        deps.get_servicio_autenticacion
    ] = lambda: auth

    app.dependency_overrides[
        deps.get_servicio_imagenes
    ] = lambda: servicio

    with TestClient(
        app,
        base_url="https://testserver",
        raise_server_exceptions=False,
    ) as cliente:
        yield cliente, servicio, usuario


def autenticar(cliente):
    cliente.cookies.set("gastro_sesion", "token-sintetico")


def enviar(cliente, contenido=b"contenido-sintetico"):
    return cliente.post(
        "/api/v1/imagenes",
        files={
            "archivo": (
                "endoscopia.png",
                contenido,
                "image/png",
            )
        },
    )


def test_carga_http_doctor_devuelve_201(entorno):
    cliente, servicio, _ = entorno
    autenticar(cliente)

    respuesta = enviar(cliente)

    assert respuesta.status_code == 201
    datos = respuesta.json()

    assert datos["imagen_id"] == "tmp_" + "0" * 26
    assert datos["nombre"] == "endoscopia.png"
    assert datos["formato"] == "PNG"
    assert datos["ancho"] == 224
    assert datos["alto"] == 224
    assert datos["sha256"] == "a" * 64

    servicio.cargar.assert_called_once_with(
        UUID(int=1),
        b"contenido-sintetico",
    )


def test_carga_http_sin_sesion_rechazada(entorno):
    cliente, servicio, _ = entorno

    respuesta = enviar(cliente)

    assert respuesta.status_code == 401
    assert respuesta.json()["error"]["codigo"] == "SESION_EXPIRADA"
    servicio.cargar.assert_not_called()


def test_carga_http_administrador_rechazado(entorno):
    cliente, servicio, usuario = entorno
    usuario.rol.codigo = CodigoRol.ADMINISTRADOR
    autenticar(cliente)

    respuesta = enviar(cliente)

    assert respuesta.status_code == 403
    assert respuesta.json()["error"]["codigo"] == "PERMISO_DENEGADO"
    servicio.cargar.assert_not_called()


def test_carga_http_supera_10_mib(entorno):
    cliente, servicio, _ = entorno
    autenticar(cliente)

    respuesta = enviar(
        cliente,
        b"x" * (PESO_MAXIMO_BYTES + 1),
    )

    assert respuesta.status_code == 413
    assert respuesta.json()["error"]["codigo"] == "IMAGEN_DEMASIADO_PESADA"
    servicio.cargar.assert_not_called()


def test_carga_http_sin_archivo(entorno):
    cliente, servicio, _ = entorno
    autenticar(cliente)

    respuesta = cliente.post("/api/v1/imagenes")

    assert respuesta.status_code == 422
    assert respuesta.json()["error"]["codigo"] == "DATOS_INVALIDOS"
    servicio.cargar.assert_not_called()


@pytest.mark.parametrize(
    "estado,codigo",
    [
        (415, "IMAGEN_FORMATO_NO_PERMITIDO"),
        (422, "IMAGEN_RESOLUCION_INSUFICIENTE"),
        (422, "IMAGEN_ILEGIBLE"),
    ],
)
def test_controlador_propaga_errores_del_servicio(
    entorno, estado, codigo
):
    cliente, servicio, _ = entorno
    autenticar(cliente)

    servicio.cargar.side_effect = ErrorApi(
        estado,
        codigo,
        "Imagen no admitida.",
    )

    respuesta = enviar(cliente)

    assert respuesta.status_code == estado
    assert respuesta.json()["error"]["codigo"] == codigo


@pytest.mark.parametrize(
    "entrada,esperado",
    [
        (r"C:\carpeta\endoscopia.png", "endoscopia.png"),
        ("carpeta/imagen.jpg", "imagen.jpg"),
        ("foto\x00.png", "foto.png"),
        (None, "imagen"),
        ("   ", "imagen"),
        ("x" * 150, "x" * 120),
    ],
)
def test_nombre_visible_limpia_nombre(entrada, esperado):
    assert nombre_visible(entrada) == esperado