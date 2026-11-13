"""RNF-20/#208: contratos de inferencia y clasificación, sin servicios externos."""
import base64
import io
import socket
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import httpx
import pytest
from PIL import Image

from app.adapters.inferencia import AdaptadorHuggingFace, ErrorInferencia, traducir
from app.models import EstadoAnalisis, EstadoInferencia, EtapaProceso, FormatoImagen
from app.models import LogInferencia, RegionInteres, ResultadoCaracteristica
from app.services import clasificacion
from app.services.analisis import CodigoFalla


@pytest.fixture(autouse=True)
def sin_red(monkeypatch):
    def prohibida(*args, **kwargs):
        raise AssertionError("Acceso externo prohibido en pruebas unitarias")
    monkeypatch.setattr(socket.socket, "connect", prohibida)
    monkeypatch.setattr(socket.socket, "connect_ex", prohibida)
    monkeypatch.setattr(socket, "create_connection", prohibida)


def png():
    salida = io.BytesIO()
    Image.new("RGB", (8, 8), (20, 40, 60)).save(salida, "PNG")
    return salida.getvalue()


def respuesta():
    return {"revision_sha": "A" * 40, "latencia_ms": 25, "caracteristicas": [
        {"codigo": "SINTETICA", "probabilidad": 0.5, "regiones": [
            {"x": 0.1, "y": 0.2, "ancho": 0.3, "alto": 0.4, "area_pct": 12,
             "mapa_calor_base64": base64.b64encode(png()).decode()}]}]}


@pytest.mark.parametrize("probabilidad", [0, 0.5, 1])
def test_traduce_respuesta_valida_y_limites(probabilidad):
    datos = respuesta()
    datos["caracteristicas"][0]["probabilidad"] = probabilidad
    salida = traducir(datos)
    assert salida.revision_sha == "a" * 40
    assert salida.latencia_ms == 25
    c = salida.caracteristicas[0]
    assert c.codigo == "SINTETICA"
    assert c.probabilidad == Decimal(str(probabilidad))
    assert c.regiones[0].mapa_png == png()
    assert c.regiones[0].area_pct == Decimal("12.00")


@pytest.mark.parametrize("valor", [-0.01, 1.01, float("nan"), float("inf"), "invalida", None])
def test_rechaza_probabilidad_invalida(valor):
    datos = respuesta()
    datos["caracteristicas"][0]["probabilidad"] = valor
    with pytest.raises(ErrorInferencia, match="RESPUESTA_INVALIDA"):
        traducir(datos)


@pytest.mark.parametrize("caso", ["sin-caracteristicas", "vacias", "duplicadas", "revision", "latencia"])
def test_rechaza_contrato_invalido(caso):
    datos = respuesta()
    if caso == "sin-caracteristicas":
        del datos["caracteristicas"]
    elif caso == "vacias":
        datos["caracteristicas"] = []
    elif caso == "duplicadas":
        datos["caracteristicas"] *= 2
    elif caso == "revision":
        datos["revision_sha"] = "no-es-sha"
    else:
        datos["latencia_ms"] = -1
    with pytest.raises(ErrorInferencia, match="RESPUESTA_INVALIDA"):
        traducir(datos)


@pytest.mark.parametrize("mapa", ["base64!!", base64.b64encode(b"no PNG").decode(),
    base64.b64encode(b"\x89PNG\r\n\x1a\nCORRUPTO").decode()],
    ids=["base64-invalido", "firma-invalida", "png-corrupto-con-firma"])
def test_rechaza_mapa_no_decodificable(mapa):
    if mapa == base64.b64encode(b"\x89PNG\r\n\x1a\nCORRUPTO").decode():
        # Confirma la precondición con un decodificador real, independiente del adaptador.
        with pytest.raises(OSError):
            Image.open(io.BytesIO(base64.b64decode(mapa)))
    datos = respuesta()
    datos["caracteristicas"][0]["regiones"][0]["mapa_calor_base64"] = mapa
    with pytest.raises(ErrorInferencia, match="RESPUESTA_INVALIDA"):
        traducir(datos)


@pytest.mark.parametrize("formato,mime,nombre", [(FormatoImagen.PNG, "image/png", "imagen.png"),
    (FormatoImagen.JPEG, "image/jpeg", "imagen.jpg")])
def test_adaptador_solicitud_y_respuesta(formato, mime, nombre):
    peticiones = []
    def responder(request):
        peticiones.append(request)
        assert request.method == "POST"
        assert str(request.url) == "https://modelo.invalid/clasificar"
        assert request.headers["authorization"] == "Bearer credencial-sintetica"
        assert mime.encode() in request.content
        assert nombre.encode() in request.content
        return httpx.Response(200, json=respuesta())
    salida = AdaptadorHuggingFace("https://modelo.invalid/", "credencial-sintetica",
        transporte=httpx.MockTransport(responder)).clasificar(b"imagen-sintetica", formato)
    assert len(peticiones) == 1
    assert salida.caracteristicas[0].probabilidad == Decimal("0.5")


@pytest.mark.parametrize("caso,codigo", [("timeout", "TIEMPO_AGOTADO"),
    ("conexion", "NO_DISPONIBLE"), ("503", "NO_DISPONIBLE"),
    ("302", "NO_DISPONIBLE"), ("json", "RESPUESTA_INVALIDA")])
def test_adaptador_fallos_y_no_sigue_redirecciones(caso, codigo):
    peticiones = []
    def responder(request):
        peticiones.append(request)
        if caso == "timeout":
            raise httpx.ReadTimeout("simulado", request=request)
        if caso == "conexion":
            raise httpx.ConnectError("simulado", request=request)
        if caso == "json":
            return httpx.Response(200, content=b"no-json")
        return httpx.Response(int(caso), headers={"location": "https://otro.invalid"})
    adaptador = AdaptadorHuggingFace("https://modelo.invalid", "credencial-sintetica",
        transporte=httpx.MockTransport(responder))
    with pytest.raises(ErrorInferencia) as error:
        adaptador.clasificar(png(), FormatoImagen.PNG)
    assert error.value.codigo == codigo
    assert len(peticiones) == 1


@pytest.mark.parametrize("url,token", [("http://modelo.invalid", "sintetico"),
    ("https://modelo.invalid", "")])
def test_configuracion_insegura_no_envia(url, token):
    responder = Mock(side_effect=AssertionError("No debe enviar"))
    with pytest.raises(ErrorInferencia, match="SIN_CONFIGURAR"):
        AdaptadorHuggingFace(url, token, transporte=httpx.MockTransport(responder)).clasificar(
            png(), FormatoImagen.PNG)
    responder.assert_not_called()


@pytest.fixture
def escenario(monkeypatch):
    reloj = datetime(2026, 1, 1, tzinfo=timezone.utc)
    tiempos = iter([10.0, 10.125])
    monkeypatch.setattr(clasificacion.time, "monotonic", lambda: next(tiempos))
    a = SimpleNamespace(id=UUID(int=1), modelo_id=UUID(int=2),
        modelo=SimpleNamespace(revision_sha="a" * 40), imagen_formato=FormatoImagen.PNG,
        estado=EstadoAnalisis.PROCESANDO, etapa_proceso=EtapaProceso.CLASIFICAR, codigo_error=None)
    inferencia, almacen, repo, catalogo, unidad = [Mock() for _ in range(5)]
    inferencia.clasificar.return_value = traducir(respuesta())
    catalogo.caracteristicas_activas.return_value = [SimpleNamespace(
        id=UUID(int=3), codigo="SINTETICA", umbral=None)]
    catalogo.configuracion.return_value = SimpleNamespace(
        usar_umbral_por_caracteristica=False, umbral_global=Decimal("0.5"))
    eventos = []
    unidad.confirmar.side_effect = lambda: eventos.append((a.estado, a.etapa_proceso))
    servicio = clasificacion.ServicioClasificacion(inferencia, almacen, repo, catalogo,
        unidad, lambda: reloj)
    return SimpleNamespace(a=a, inferencia=inferencia, almacen=almacen, repo=repo,
        catalogo=catalogo, unidad=unidad, servicio=servicio, reloj=reloj, eventos=eventos)


def test_clasificacion_guarda_resultado_mapa_y_log(escenario):
    e = escenario
    e.servicio(e.a, png())
    assert e.eventos == [(EstadoAnalisis.PROCESANDO, EtapaProceso.GRAD_CAM),
                         (EstadoAnalisis.COMPLETADO, None)]
    assert e.a.completado_en == e.reloj
    filas = [f for llamada in e.repo.agregar.call_args_list for f in llamada.args]
    resultado = next(f for f in filas if isinstance(f, ResultadoCaracteristica))
    assert resultado.probabilidad == resultado.umbral_aplicado == Decimal("0.5")
    assert resultado.supera_umbral is True
    region = next(f for f in filas if isinstance(f, RegionInteres))
    e.almacen.subir.assert_called_once_with(region.mapa_calor_clave_objeto, png(), "image/png")
    log = next(f for f in filas if isinstance(f, LogInferencia))
    assert log.estado == EstadoInferencia.EXITO
    assert log.latencia_vision_ms == 125


@pytest.mark.parametrize("caso,codigo", [("faltante", "RESPUESTA_INVALIDA"),
    ("extra", "RESPUESTA_INVALIDA"), ("revision", "REVISION_DISTINTA"),
    ("timeout", "TIEMPO_AGOTADO"), ("conexion", "NO_DISPONIBLE")])
def test_clasificacion_fallida_registra_error(escenario, caso, codigo):
    e = escenario
    datos = respuesta()
    if caso == "faltante":
        e.catalogo.caracteristicas_activas.return_value.append(SimpleNamespace(codigo="OTRA"))
    elif caso == "extra":
        datos["caracteristicas"].append({"codigo": "OTRA", "probabilidad": 0.2})
    elif caso == "revision":
        datos["revision_sha"] = "b" * 40
    else:
        e.inferencia.clasificar.side_effect = ErrorInferencia(codigo)
    e.inferencia.clasificar.return_value = traducir(datos)
    e.servicio(e.a, png())
    assert e.a.estado == EstadoAnalisis.FALLIDO
    assert e.a.codigo_error == CodigoFalla.SERVICIO_NO_DISPONIBLE.value
    assert e.a.etapa_proceso == EtapaProceso.CLASIFICAR
    registro = e.repo.agregar.call_args.args[0]
    assert isinstance(registro, LogInferencia)
    assert registro.codigo_error == codigo
    assert registro.latencia_vision_ms == 125
    assert registro.estado == (EstadoInferencia.TIEMPO_AGOTADO if caso == "timeout" else EstadoInferencia.ERROR)
    e.almacen.subir.assert_not_called()
    e.unidad.confirmar.assert_called_once()


@pytest.mark.parametrize("caso", ["sin-configuracion", "almacen"])
def test_error_de_guardado_se_propaga_al_orquestador(escenario, caso):
    e = escenario
    if caso == "sin-configuracion":
        e.catalogo.configuracion.return_value = None
        esperado = RuntimeError
    else:
        e.almacen.subir.side_effect = OSError("almacen simulado no disponible")
        esperado = OSError
    with pytest.raises(esperado):
        e.servicio(e.a, png())
    assert e.a.estado != EstadoAnalisis.COMPLETADO
    e.repo.agregar.assert_not_called()
