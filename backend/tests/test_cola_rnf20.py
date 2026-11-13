"""RNF-20 (#139/#208): contrato de ColaCelery, sin broker ni workers reales."""
import socket
from unittest.mock import Mock
from uuid import UUID

import pytest
from celery import Celery
from kombu.exceptions import OperationalError

from app.adapters.cola import ColaCelery, ErrorCola

CASOS = [
    ("encolar_analisis", "gastroia.procesar_analisis"),
    ("encolar_explicacion", "gastroia.explicar_analisis"),
]
IDENTIFICADOR = UUID("12345678-1234-5678-9abc-123456789abc")
TEXTO_ID = "12345678-1234-5678-9abc-123456789abc"


@pytest.fixture(autouse=True)
def sin_red(monkeypatch):
    def prohibida(*args, **kwargs):
        raise AssertionError("Las pruebas no pueden acceder a servicios externos")
    monkeypatch.setattr(socket.socket, "connect", prohibida)
    monkeypatch.setattr(socket.socket, "connect_ex", prohibida)
    monkeypatch.setattr(socket, "create_connection", prohibida)


@pytest.mark.parametrize("metodo,tarea", CASOS, ids=["analisis", "explicacion"])
def test_envia_tarea_correcta_con_uuid_textual_y_sin_reintentos(metodo, tarea):
    app = Mock(spec=Celery)
    app.send_task.return_value = object()  # el adaptador no expone el AsyncResult
    cola = ColaCelery(app)

    assert getattr(cola, metodo)(IDENTIFICADOR) is None

    app.send_task.assert_called_once_with(tarea, args=[TEXTO_ID], retry=False)
    assert isinstance(app.send_task.call_args.kwargs["args"][0], str)


@pytest.mark.parametrize("metodo,tarea", CASOS, ids=["analisis", "explicacion"])
@pytest.mark.parametrize("tipo_error", [
    OperationalError, ConnectionError, TimeoutError, RuntimeError,
], ids=["kombu", "conexion", "timeout", "inesperado"])
def test_traduce_error_conserva_causa_y_no_reintenta(metodo, tarea, tipo_error, caplog):
    app = Mock(spec=Celery)
    original = tipo_error("detalle-sintetico-del-broker")
    app.send_task.side_effect = original
    cola = ColaCelery(app)

    with pytest.raises(ErrorCola) as resultado:
        getattr(cola, metodo)(IDENTIFICADOR)

    assert str(resultado.value) == "No se pudo encolar el análisis."
    assert resultado.value.__cause__ is original
    assert "detalle-sintetico-del-broker" not in str(resultado.value)
    assert "detalle-sintetico-del-broker" not in caplog.text
    app.send_task.assert_called_once_with(tarea, args=[TEXTO_ID], retry=False)
