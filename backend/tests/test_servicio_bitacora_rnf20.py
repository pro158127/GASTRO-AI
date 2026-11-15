"""RF-A02/RNF-05/RF-DB02: consultas, CSV y presentación; sin SQL real."""
import csv
import io
import socket
from datetime import UTC, date, datetime, timedelta, timezone
from types import SimpleNamespace as NS
from unittest.mock import Mock
from uuid import UUID

import pytest

from app.core.errores import ErrorApi
from app.models import AccionBitacora as A, ResultadoAccion as R
from app.services.bitacora import ServicioBitacora, detalle_legible


@pytest.fixture
def e(monkeypatch):
    def prohibida(*args, **kwargs):
        raise AssertionError("Conexion externa prohibida")
    monkeypatch.setattr(socket.socket, "connect", prohibida)
    monkeypatch.setattr(socket.socket, "connect_ex", prohibida)
    monkeypatch.setattr(socket, "create_connection", prohibida)
    repo, publicador, unidad = Mock(), Mock(), Mock()
    repo.para_exportar.return_value = []
    actor = NS(id=UUID(int=1), nombre="QA", apellido="Sintético")
    return NS(repo=repo, publicador=publicador, unidad=unidad, actor=actor,
              s=ServicioBitacora(repo, publicador, unidad, lambda: datetime(2026, 1, 1, tzinfo=UTC)))


def exportar(e, desde=date(2026, 1, 1), hasta=date(2026, 1, 1)):
    return e.s.exportar(e.actor, "127.0.0.1", desde, hasta)


def fila(actor=None, ip=None):
    return NS(actor=actor, ip=ip, ocurrido_en=datetime(2026, 1, 1, 12, tzinfo=timezone(timedelta(hours=-5))),
              accion=A.VERIFICACION_2FA, resultado=R.EXITO, detalle={"no_exportar": "dato-sintetico"})


def test_consulta_busca_usuarios_objetivo_y_destino_sin_duplicar(e):
    entradas = [NS(entidad="Usuario", entidad_id="a", detalle={"destino_id": "b"}),
                NS(entidad="Usuario", entidad_id="a", detalle=None),
                NS(entidad="Otra", entidad_id="no-buscar", detalle=[])]
    e.repo.listar.return_value = (entradas, 3)
    e.repo.usuarios.return_value = {"a": e.actor}
    filtro = object()
    resultado = e.s.consultar(filtro)
    assert resultado.entradas == entradas and resultado.total == 3
    assert resultado.usuarios == {"a": e.actor}
    e.repo.listar.assert_called_once_with(filtro)
    e.repo.usuarios.assert_called_once_with({"a", "b"})
    e.unidad.confirmar.assert_not_called()


def test_consulta_vacia(e):
    e.repo.listar.return_value = ([], 0); e.repo.usuarios.return_value = {}
    salida = e.s.consultar(object())
    assert salida.entradas == [] and salida.total == 0 and salida.usuarios == {}
    e.repo.usuarios.assert_called_once_with(set())


def test_actores_delega(e):
    e.repo.actores.return_value = [e.actor]
    assert e.s.actores() == [e.actor]
    e.repo.actores.assert_called_once_with()


def test_csv_columnas_bom_utc_contenido_y_auditoria(e):
    e.repo.para_exportar.return_value = [fila(e.actor, "127.0.0.1"), fila()]
    nombre, datos = exportar(e)
    assert nombre == "auditoria_2026-01-01_2026-01-01.csv"
    assert datos.startswith(b"\xef\xbb\xbf")
    filas = list(csv.reader(io.StringIO(datos.decode("utf-8-sig"))))
    assert filas == [["fecha_hora", "usuario", "evento", "resultado", "ip"],
                     ["2026-01-01T17:00:00+00:00", "QA Sintético", "VERIFICACION_2FA", "EXITO", "127.0.0.1"],
                     ["2026-01-01T17:00:00+00:00", "", "VERIFICACION_2FA", "EXITO", ""]]
    assert "dato-sintetico" not in datos.decode("utf-8-sig")
    acciones, inicio, fin = e.repo.para_exportar.call_args.args
    assert acciones == [A.CUENTA_CREADA, A.ENVIO_CREDENCIAL, A.VINCULACION_TOTP, A.VERIFICACION_2FA]
    assert inicio.astimezone(UTC) == datetime(2026, 1, 1, 5, tzinfo=UTC)
    assert fin.astimezone(UTC) == datetime(2026, 1, 2, 5, tzinfo=UTC)
    evento = e.publicador.publicar.call_args.args[0]
    assert evento.accion == A.AUDITORIA_EXPORTADA and evento.actor_id == e.actor.id
    assert evento.detalle == {"desde": "2026-01-01", "hasta": "2026-01-01", "filas": 2}
    assert evento.resultado == R.EXITO and evento.ip == "127.0.0.1"
    e.unidad.confirmar.assert_called_once_with()


def test_csv_vacio_conserva_cabecera_y_audita_cero(e):
    _, datos = exportar(e)
    assert list(csv.reader(io.StringIO(datos.decode("utf-8-sig")))) == [["fecha_hora", "usuario", "evento", "resultado", "ip"]]
    assert e.publicador.publicar.call_args.args[0].detalle["filas"] == 0
    e.unidad.confirmar.assert_called_once()


@pytest.mark.parametrize("desde,hasta,codigo", [
    (None, date(2026, 1, 1), "PERIODO_INVALIDO"),
    (date(2026, 1, 1), None, "PERIODO_INVALIDO"),
    (None, None, "PERIODO_INVALIDO"),
    (date(2026, 1, 2), date(2026, 1, 1), "RANGO_FECHAS_INVALIDO"),
    (date(2026, 1, 1), date(2027, 1, 2), "PERIODO_INVALIDO"),
])
def test_periodo_invalido_no_consulta_ni_confirma(e, desde, hasta, codigo):
    with pytest.raises(ErrorApi) as obtenido: exportar(e, desde, hasta)
    assert obtenido.value.estado == 422 and obtenido.value.codigo == codigo
    e.repo.para_exportar.assert_not_called()
    e.publicador.publicar.assert_not_called()
    e.unidad.confirmar.assert_not_called()


def test_limite_366_dias_inclusivos_aceptado(e):
    exportar(e, date(2026, 1, 1), date(2027, 1, 1))
    e.repo.para_exportar.assert_called_once()
    e.unidad.confirmar.assert_called_once()


@pytest.mark.parametrize("prefijo", ["=", "+", "-", "@", "\t", "\r"])
def test_csv_neutraliza_formulas_nombre_e_ip(e, prefijo):
    nombre = prefijo + "1+1"
    e.repo.para_exportar.return_value = [fila(NS(nombre=nombre, apellido="QA"), nombre)]
    _, datos = exportar(e)
    row = list(csv.reader(io.StringIO(datos.decode("utf-8-sig"))))[1]
    assert row[1] == "'" + nombre + " QA" and row[4] == "'" + nombre


@pytest.mark.parametrize("origen", ["repositorio", "publicador", "unidad"])
def test_fallo_exportacion_no_se_oculta(e, origen):
    fallo = RuntimeError("fallo-sintetico")
    destino = {"repositorio": e.repo.para_exportar, "publicador": e.publicador.publicar, "unidad": e.unidad.confirmar}[origen]
    destino.side_effect = fallo
    with pytest.raises(RuntimeError) as obtenido: exportar(e)
    assert obtenido.value is fallo
    if origen != "unidad": e.unidad.confirmar.assert_not_called()


@pytest.mark.parametrize("detalle", [None, {}, [], "dato-no-dict"])
def test_detalle_ausente_o_no_estructurado(detalle):
    assert detalle_legible(NS(accion=A.CUENTA_EDITADA, detalle=detalle), {}) is None


@pytest.mark.parametrize("accion,detalle,esperado", [
    (A.INICIO_SESION, {"motivo": "bloqueo"}, "Rechazado: cuenta bloqueada"),
    (A.INICIO_SESION, {"etapa": "PENDIENTE_2FA"}, "Siguiente paso: código del segundo factor"),
    (A.CUENTA_CREADA, {"rol": "DOCTOR"}, "Rol: Doctor"),
    (A.CUENTA_EDITADA, {"campos": ["nombre", "telefono"], "propio": True}, "Campos: nombre, teléfono (desde su perfil)"),
    (A.CUENTA_EDITADA, {"campos": []}, "Campos: ninguno"),
    (A.ROL_CAMBIADO, {"de": "DOCTOR", "a": "ADMINISTRADOR"}, "De Doctor a Administrador"),
    (A.ENVIO_CREDENCIAL, {"motivo": "RESTABLECIMIENTO"}, "Motivo: restablecimiento"),
    (A.AUDITORIA_EXPORTADA, {"desde": "2026-01-01", "hasta": "2026-01-02", "filas": 3}, "Período 2026-01-01 a 2026-01-02, 3 filas"),
    (A.AUDITORIA_EXPORTADA, {"desde": "2026-01-01", "hasta": "2026-01-02"}, "Período 2026-01-01 a 2026-01-02, 0 filas"),
    (A.CIERRE_SESION, {"motivo": "manual", "lista": ["no-agregar"]}, "motivo: manual"),
    (A.CIERRE_SESION, {"lista": ["no-agregar"]}, None),
])
def test_detalle_traduce_contrato_sin_agregar_datos(accion, detalle, esperado):
    assert detalle_legible(NS(accion=accion, detalle=detalle), {}) == esperado


@pytest.mark.parametrize("cantidad,usuarios,esperado", [
    (1, {}, "1 caso, reasignación manual"),
    (2, {"destino": NS(nombre="QA", apellido="Destino")}, "2 casos, reasignación manual, a QA Destino"),
])
def test_detalle_traslado_resuelve_destino(cantidad, usuarios, esperado):
    entrada = NS(accion=A.CASOS_REASIGNADOS, detalle={"casos": cantidad, "tipo": "REASIGNACION", "destino_id": "destino"})
    assert detalle_legible(entrada, usuarios) == esperado


@pytest.mark.parametrize("antes,despues,esperado", [
    ({}, {}, "Sin cambios en los valores"),
    ({"usar_umbral_por_caracteristica": False}, {"usar_umbral_por_caracteristica": True}, "Modo por característica"),
    ({"usar_umbral_por_caracteristica": True}, {"usar_umbral_por_caracteristica": False}, "Modo global"),
    ({"umbral_global": "0.5", "umbrales": {"B": None, "A": "0.4"}},
     {"umbral_global": "0.6", "umbrales": {"B": "0.7", "A": "0.4"}}, "Umbral global 0.5 → 0.6; B global → 0.7"),
])
def test_detalle_configuracion(antes, despues, esperado):
    entrada = NS(accion=A.CONFIGURACION_INFERENCIA_CAMBIADA, detalle={"antes": antes, "despues": despues})
    assert detalle_legible(entrada, {}) == esperado
