"""RNF-20 / RF-D01 / RF-H01: contratos HTTP de pacientes, con servicios aislados."""

from datetime import UTC, datetime
from types import SimpleNamespace as NS
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routers import pacientes
from app.core.errores import ErrorApi, registrar_manejadores
from app.models import CodigoRol, EtapaSesion
from app.repositories.pacientes_repository import HistorialPaciente

CASO = UUID("12345678-1234-5678-9abc-123456789abc")
MEDICO = UUID("12345678-1234-5678-9abc-123456789abd")
DOCUMENTO = "9331817450"  # ficticio; no se transmite por URL


@pytest.fixture
def entorno():
    usuario = NS(id=MEDICO, rol=NS(codigo=CodigoRol.DOCTOR))
    auth = Mock()
    auth.validar_sesion.return_value = NS(usuario=usuario)
    consulta = Mock()
    historial = Mock()
    app = FastAPI()
    registrar_manejadores(app)
    app.include_router(pacientes.router, prefix="/api/v1")
    app.dependency_overrides[deps.get_servicio_autenticacion] = lambda: auth
    app.dependency_overrides[deps.get_servicio_pacientes] = lambda: consulta
    app.dependency_overrides[deps.get_servicio_historial] = lambda: historial
    with TestClient(app, base_url="https://testserver", raise_server_exceptions=False) as client:
        yield client, usuario, auth, consulta, historial
    app.dependency_overrides.clear()


def enviar(client, ruta="consulta", **extra):
    return client.post(
        f"/api/v1/pacientes/{ruta}",
        json={"tipo_documento": "CC", "numero_documento": DOCUMENTO, **extra},
    )


@pytest.mark.parametrize("ruta", ["consulta", "analisis/buscar"])
def test_sin_sesion_no_consulta_historial(entorno, ruta):
    client, _, auth, consulta, historial = entorno
    auth.validar_sesion.side_effect = ErrorApi(401, "SESION_EXPIRADA", "Sesión requerida")
    response = enviar(client, ruta)
    assert response.status_code == 401
    assert response.json()["error"]["codigo"] == "SESION_EXPIRADA"
    consulta.consultar.assert_not_called()
    historial.de_paciente.assert_not_called()


@pytest.mark.parametrize("ruta", ["consulta", "analisis/buscar"])
def test_administrador_rechazado_antes_de_consultar(entorno, ruta):
    client, usuario, _, consulta, historial = entorno
    usuario.rol.codigo = CodigoRol.ADMINISTRADOR
    client.cookies.set("gastro_sesion", "sesion-sintetica")
    response = enviar(client, ruta)
    assert response.status_code == 403
    assert response.json()["error"]["codigo"] == "PERMISO_DENEGADO"
    consulta.consultar.assert_not_called()
    historial.de_paciente.assert_not_called()


def test_consulta_sin_historial_no_revela_documento(entorno):
    client, usuario, auth, consulta, _ = entorno
    client.cookies.set("gastro_sesion", "sesion-sintetica")
    consulta.consultar.return_value = HistorialPaciente(None, 0, None)
    response = enviar(client)
    assert response.status_code == 200
    assert response.json() == {
        "tiene_historial": False, "caso_id": None, "total_analisis": 0,
        "ultimo_analisis_en": None,
    }
    assert DOCUMENTO not in response.text
    consulta.consultar.assert_called_once_with(usuario, "CC", DOCUMENTO)
    auth.validar_sesion.assert_called_once_with("sesion-sintetica", (EtapaSesion.ACTIVA,), False)


def test_consulta_con_historial_devuelve_conteo_y_fecha(entorno):
    client, usuario, _, consulta, _ = entorno
    client.cookies.set("gastro_sesion", "sesion-sintetica")
    when = datetime(2026, 11, 26, 12, tzinfo=UTC)
    consulta.consultar.return_value = HistorialPaciente(CASO, 2, when)
    response = enviar(client)
    assert response.status_code == 200
    assert response.json()["tiene_historial"] is True
    assert response.json()["caso_id"] == str(CASO)
    assert response.json()["total_analisis"] == 2
    assert response.json()["ultimo_analisis_en"] == "2026-11-26T12:00:00Z"
    assert DOCUMENTO not in response.text
    consulta.consultar.assert_called_once_with(usuario, "CC", DOCUMENTO)


@pytest.mark.parametrize("ruta", ["consulta", "analisis/buscar"])
def test_documento_malformado_no_llega_al_servicio(entorno, ruta):
    client, _, _, consulta, historial = entorno
    client.cookies.set("gastro_sesion", "sesion-sintetica")
    response = enviar(client, ruta, numero_documento="9" * 31)
    assert response.status_code == 422
    assert response.json()["error"]["codigo"] == "DATOS_INVALIDOS"
    assert DOCUMENTO not in response.text
    consulta.consultar.assert_not_called()
    historial.de_paciente.assert_not_called()


def test_documento_rechazado_por_regla_de_negocio(entorno):
    client, _, _, consulta, _ = entorno
    client.cookies.set("gastro_sesion", "sesion-sintetica")
    consulta.consultar.side_effect = ErrorApi(
        422, "DOCUMENTO_INVALIDO", "Documento inválido",
        [{"campo": "numero_documento", "mensaje": "Documento inválido"}],
    )
    response = enviar(client)
    assert response.status_code == 422
    assert response.json()["error"]["codigo"] == "DOCUMENTO_INVALIDO"
    assert response.json()["error"]["campos"][0]["campo"] == "numero_documento"
    assert DOCUMENTO not in response.text


def test_busqueda_sin_casos_devuelve_pagina_vacia_y_filtro(entorno):
    client, usuario, _, _, historial = entorno
    client.cookies.set("gastro_sesion", "sesion-sintetica")
    historial.de_paciente.return_value = NS(analisis=[], total=0, casos=[])
    response = enviar(
        client, "analisis/buscar", pagina=2, por_pagina=8,
        estado="FALLIDO", orden="-solicitado_en",
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["paginacion"] == {"pagina": 2, "por_pagina": 8, "total": 0}
    assert data["caso_id"] is None and data["caso_ids"] == []
    assert DOCUMENTO not in response.text
    args = historial.de_paciente.call_args.args
    assert args[:3] == (usuario.id, "CC", DOCUMENTO)
    filtro = args[3]
    assert filtro.pagina == 2 and filtro.por_pagina == 8
    assert filtro.estado.value == "FALLIDO" and filtro.ascendente is False


def test_busqueda_con_caso_preserva_ids_sin_exponer_documento(entorno, monkeypatch):
    client, usuario, _, _, historial = entorno
    client.cookies.set("gastro_sesion", "sesion-sintetica")
    item = object()
    historial.de_paciente.return_value = NS(analisis=[item], total=1, casos=[CASO])
    fila = Mock(return_value={
        "id": str(CASO), "codigo": "A-2026-000001", "solicitado_en": "2026-11-26T12:00:00Z",
        "estado": "COMPLETADO", "caracteristicas_que_superan": [],
        "caracteristica_principal": None, "probabilidad_principal": None,
        "tiene_observacion": False, "observacion": None, "modelo_revision": "revision-qa",
        "trasladado": False,
        "realizado_por": {"nombre": "QA", "apellido": "Sintético", "cuenta_eliminada": False},
    })
    monkeypatch.setattr(pacientes, "fila_historial", fila)
    response = enviar(client, "analisis/buscar")
    assert response.status_code == 200
    data = response.json()
    assert data["paginacion"]["total"] == 1
    assert data["caso_id"] == str(CASO) and data["caso_ids"] == [str(CASO)]
    assert data["items"][0]["estado"] == "COMPLETADO"
    assert DOCUMENTO not in response.text
    fila.assert_called_once_with(item, usuario.id)


def test_busqueda_rechaza_filtro_invalido_antes_del_servicio(entorno):
    client, _, _, _, historial = entorno
    client.cookies.set("gastro_sesion", "sesion-sintetica")
    response = enviar(client, "analisis/buscar", estado="NO_EXISTE")
    assert response.status_code == 422
    assert response.json()["error"]["codigo"] == "DATOS_INVALIDOS"
    historial.de_paciente.assert_not_called()
