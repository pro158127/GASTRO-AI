"""RNF-20/#208: explicación del resultado con proveedor y persistencia simulados."""
import json
import socket
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import pytest

from app.adapters.llm import AdaptadorProveedorLLM, ErrorProveedorLLM
from app.core.errores import ErrorApi
from app.models import Analisis, EstadoAnalisis, EstadoExplicacion, ExplicacionLlm, ResultadoCaracteristica
from app.services import explicacion as mod


TEXTO = "El modelo asigna una probabilidad del 50 % a la característica evaluada. " \
        "Esta valoración experimental no sustituye el juicio profesional."
RESUMEN = {"caracteristicas": [{"nombre": "Característica sintética", "probabilidad_pct": 50.0,
    "umbral_pct": 40.0, "supera_umbral": True,
    "regiones": [{"orden": 1, "ubicacion": "zona central", "area_pct": 10.0}]}]}


@pytest.fixture(autouse=True)
def sin_red(monkeypatch):
    def prohibida(*args, **kwargs):
        raise AssertionError("No se permiten conexiones externas")
    monkeypatch.setattr(socket.socket, "connect", prohibida)
    monkeypatch.setattr(socket.socket, "connect_ex", prohibida)
    monkeypatch.setattr(socket, "create_connection", prohibida)


@pytest.mark.parametrize("termino", ["cáncer", "carcinoma", "neoplasia", "tumor", "linfoma",
    "malignidad", "tratamiento", "antibiótico", "medicamento", "receta", "cirugía", "biopsia"])
def test_rechaza_terminos_clinicos_prohibidos(termino):
    assert not mod.validar_explicacion(TEXTO + " " + termino.upper(), RESUMEN)


@pytest.mark.parametrize("porcentaje,aceptado", [("50 %", True), ("40%", True), ("10 %", True),
    ("50,5 %", True), ("49.5 %", True), ("50.51 %", False), ("49.49 %", False), ("92 %", False)])
def test_porcentajes_y_tolerancia(porcentaje, aceptado):
    assert mod.validar_explicacion("El modelo informa " + porcentaje + ". " + TEXTO, RESUMEN) is aceptado


def test_rechaza_porcentaje_negativo_no_presente_en_datos():
    texto = "El modelo asigna una probabilidad de -50 % a la característica sintética evaluada."
    assert not mod.validar_explicacion(texto, RESUMEN)


@pytest.mark.parametrize("longitud,aceptado", [(39, False), (40, True), (1500, True), (1501, False)])
def test_limites_longitud(longitud, aceptado):
    assert mod.validar_explicacion("x" * longitud, RESUMEN) is aceptado


@pytest.mark.parametrize("x,y,esperada", [("0", "0", "zona superior izquierda"),
    ("0.5", "0.5", "zona central"), ("0.9", "0.9", "zona inferior derecha"),
    ("0.5", "0", "zona superior central"), ("0", "0.5", "zona media izquierda")])
def test_ubicacion_descriptiva(x, y, esperada):
    assert mod.ubicacion(Decimal(x), Decimal(y), Decimal("0.02"), Decimal("0.02")) == esperada


def test_resumen_excluye_identificadores_imagenes_y_coordenadas():
    region = SimpleNamespace(orden=1, caja_x=Decimal("0.4"), caja_y=Decimal("0.4"),
        caja_ancho=Decimal("0.2"), caja_alto=Decimal("0.2"), area_porcentaje=Decimal("10"),
        mapa_calor_clave_objeto="NO_ENVIAR_MAPA", imagen=b"NO_ENVIAR_BYTES")
    def resultado(p, nombre, regiones):
        return SimpleNamespace(probabilidad=Decimal(p), umbral_aplicado=Decimal("0.4"),
            supera_umbral=Decimal(p) >= Decimal("0.4"), caracteristica=SimpleNamespace(nombre=nombre),
            regiones=regiones)
    analisis = SimpleNamespace(id="NO_ENVIAR_ID", imagen_clave_objeto="NO_ENVIAR_IMAGEN",
        documento="NO_ENVIAR_DOCUMENTO", resultados=[resultado("0.2", "B", []), resultado("0.5", "A", [region])])
    resumen = mod.resumen_para_llm(analisis)
    assert resumen == {"caracteristicas": [
        {"nombre": "A", "probabilidad_pct": 50.0, "umbral_pct": 40.0, "supera_umbral": True,
         "regiones": [{"orden": 1, "ubicacion": "zona central", "area_pct": 10.0}]},
        {"nombre": "B", "probabilidad_pct": 20.0, "umbral_pct": 40.0, "supera_umbral": False, "regiones": []}]}
    assert "NO_ENVIAR" not in json.dumps(resumen)


@pytest.fixture
def escenario(monkeypatch):
    tiempos = iter([100.0, 100.125])
    monkeypatch.setattr(mod.time, "monotonic", lambda: next(tiempos))
    ahora = datetime(2026, 1, 1, tzinfo=timezone.utc)
    a = Analisis(id=UUID(int=1), estado=EstadoAnalisis.COMPLETADO,
        codigo="A-SINTETICO", imagen_clave_objeto="analisis/sintetica", resultados=[])
    exp = ExplicacionLlm(id=UUID(int=2), analisis_id=a.id, estado=EstadoExplicacion.PENDIENTE,
        datos_enviados=RESUMEN, intentos=1)
    a.explicacion = exp
    repo, redactor, unidad = Mock(), Mock(), Mock()
    repo.por_id.return_value = a
    redactor.explicar.return_value = TEXTO
    servicio = mod.ServicioExplicaciones(repo, redactor, unidad, "modelo-simulado", lambda: ahora)
    return SimpleNamespace(a=a, exp=exp, repo=repo, redactor=redactor, unidad=unidad,
        servicio=servicio, ahora=ahora)


def test_genera_explicacion_y_registra_estado_y_latencia(escenario):
    e = escenario
    e.servicio.generar(e.a.id)
    e.redactor.explicar.assert_called_once_with(RESUMEN)
    assert e.exp.estado == EstadoExplicacion.GENERADA
    assert e.exp.texto == TEXTO
    assert e.exp.generada_en == e.ahora
    assert e.exp.codigo_error is None
    assert e.exp.latencia_ms == 125
    e.repo.registrar_latencia_llm.assert_called_once_with(e.a.id, 125)
    e.unidad.confirmar.assert_called_once()


def test_primera_generacion_crea_registro_pendiente(escenario):
    e = escenario
    e.a.explicacion = None
    e.redactor.explicar.return_value = "Valoración experimental del modelo; no sustituye el juicio profesional."
    e.servicio.generar(e.a.id)
    nueva = e.repo.agregar.call_args.args[0]
    assert nueva is e.a.explicacion
    assert nueva.intentos == 1
    assert nueva.datos_enviados == {"caracteristicas": []}
    assert nueva.estado == EstadoExplicacion.GENERADA
    assert e.unidad.confirmar.call_count == 2


@pytest.mark.parametrize("estado", [EstadoExplicacion.GENERADA, EstadoExplicacion.FALLIDA, EstadoExplicacion.RECHAZADA])
def test_no_repite_generacion_de_estados_cerrados(escenario, estado):
    e = escenario
    e.exp.estado = estado
    e.servicio.generar(e.a.id)
    e.redactor.explicar.assert_not_called()
    e.unidad.confirmar.assert_not_called()
    assert e.exp.estado == estado


@pytest.mark.parametrize("estado", [None, EstadoAnalisis.PROCESANDO, EstadoAnalisis.FALLIDO])
def test_no_genera_sin_resultado_completado(escenario, estado):
    e = escenario
    if estado is None:
        e.repo.por_id.return_value = None
    else:
        e.a.estado = estado
    e.servicio.generar(e.a.id)
    e.redactor.explicar.assert_not_called()
    e.repo.agregar.assert_not_called()


@pytest.mark.parametrize("error", [TimeoutError("tiempo simulado"), OSError("conexion simulada")],
    ids=["timeout", "comunicacion"])
def test_fallo_proveedor_conserva_resultado(escenario, error):
    e = escenario
    resultado = ResultadoCaracteristica(probabilidad=Decimal("0.5"),
        umbral_aplicado=Decimal("0.4"), supera_umbral=True)
    e.a.resultados.append(resultado)
    cliente = Mock()
    cliente.models.generate_content.side_effect = error
    servicio = mod.ServicioExplicaciones(e.repo, AdaptadorProveedorLLM(cliente, "simulado"),
        e.unidad, "simulado", lambda: e.ahora)
    servicio.generar(e.a.id)
    assert e.exp.estado == EstadoExplicacion.FALLIDA
    assert e.exp.codigo_error == "ERR-3001"
    assert e.exp.texto is None
    assert (e.a.estado, e.a.codigo, e.a.imagen_clave_objeto) == (
        EstadoAnalisis.COMPLETADO, "A-SINTETICO", "analisis/sintetica")
    assert e.a.resultados == [resultado]
    assert (resultado.probabilidad, resultado.umbral_aplicado, resultado.supera_umbral) == (
        Decimal("0.5"), Decimal("0.4"), True)
    cliente.models.generate_content.assert_called_once()


@pytest.mark.parametrize("texto", [TEXTO + " biopsia", TEXTO + " Probabilidad 92 %."])
def test_texto_rechazado_no_se_guarda_y_conserva_analisis(escenario, texto):
    e = escenario
    e.redactor.explicar.return_value = texto
    e.servicio.generar(e.a.id)
    assert e.exp.estado == EstadoExplicacion.RECHAZADA
    assert e.exp.codigo_error == "ERR-3002"
    assert e.exp.texto is None
    assert e.a.estado == EstadoAnalisis.COMPLETADO


@pytest.mark.parametrize("estado", [EstadoExplicacion.FALLIDA, EstadoExplicacion.RECHAZADA])
@pytest.mark.parametrize("intentos", [1, 2, 3])
def test_reintentos_y_limite(escenario, estado, intentos):
    e = escenario
    e.exp.estado, e.exp.intentos = estado, intentos
    assert e.servicio.puede_reintentar(e.exp) is (intentos < 3)
    def reabrir(exp_id, limite):
        assert (exp_id, limite) == (e.exp.id, 3)
        e.exp.estado = EstadoExplicacion.PENDIENTE
        e.exp.intentos += 1
        return True
    e.repo.reabrir_explicacion.side_effect = reabrir
    if intentos < 3:
        assert e.servicio.reintentar(e.a) is e.exp
        assert e.exp.intentos == intentos + 1
        assert e.exp.datos_enviados == RESUMEN
        e.unidad.confirmar.assert_called_once()
    else:
        with pytest.raises(ErrorApi) as error:
            e.servicio.reintentar(e.a)
        assert (error.value.estado, error.value.codigo) == (429, "REINTENTOS_AGOTADOS")
        e.repo.reabrir_explicacion.assert_not_called()


@pytest.mark.parametrize("estado", [None, EstadoExplicacion.GENERADA, EstadoExplicacion.PENDIENTE])
def test_reintento_invalido(escenario, estado):
    e = escenario
    if estado is None:
        e.a.explicacion = None
    else:
        e.exp.estado = estado
    with pytest.raises(ErrorApi) as error:
        e.servicio.reintentar(e.a)
    assert (error.value.estado, error.value.codigo) == (409, "EXPLICACION_NO_REINTENTABLE")
    e.repo.reabrir_explicacion.assert_not_called()


def test_reapertura_concurrente_rechazada(escenario):
    e = escenario
    e.exp.estado = EstadoExplicacion.FALLIDA
    e.repo.reabrir_explicacion.return_value = False
    with pytest.raises(ErrorApi) as error:
        e.servicio.reintentar(e.a)
    assert error.value.codigo == "EXPLICACION_NO_REINTENTABLE"
    e.unidad.confirmar.assert_not_called()


def test_fallo_al_encolar_conserva_intento_y_analisis(escenario):
    e = escenario
    e.exp.intentos = 2
    e.servicio.marcar_fallida(e.exp)
    assert (e.exp.estado, e.exp.codigo_error, e.exp.intentos) == (EstadoExplicacion.FALLIDA, "ERR-3001", 2)
    assert e.a.estado == EstadoAnalisis.COMPLETADO
    e.unidad.confirmar.assert_called_once()
