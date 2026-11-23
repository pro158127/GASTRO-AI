"""Pruebas unitarias del contrato Fold 2, huella del modelo y salud del Space."""

import base64
import io
from decimal import Decimal
from types import SimpleNamespace as NS

import httpx
import pytest
from PIL import Image
from pydantic import SecretStr

from app.adapters.inferencia import (
    AdaptadorHuggingFace,
    ErrorInferencia,
    InferenciaSimulada,
    crear_inferencia,
    traducir,
)
from app.models import FormatoImagen

REVISION = "a" * 40
HUELLA = "b" * 64


def png(lado=8):
    salida = io.BytesIO()
    Image.new("RGB", (lado, lado), (20, 40, 60)).save(salida, "PNG")
    return salida.getvalue()


def espacio(**cambios):
    roi = {"x": 24, "y": 12, "ancho": 100, "alto": 120, "area_pct": 20.5}
    pred = {
        "probabilidad": 0.8,
        "umbral": 0.5,
        "detectado": True,
        "region_roi": roi,
        "mapa_calor_png_b64": base64.b64encode(png()).decode(),
    }
    respuesta = {
        "revision_sha": REVISION,
        "checkpoint_sha256": HUELLA,
        "clases": ["GASTRITIS"],
        "predicciones": {"GASTRITIS": pred},
    }
    respuesta.update(cambios)
    return respuesta


def test_traduce_contrato_fold2_normaliza_rois_y_descarta_caja_vacia():
    datos = espacio()
    datos["predicciones"]["ATROFIA"] = {
        "probabilidad": 0.2,
        "region_roi": {"x": 0, "y": 0, "ancho": 0, "alto": 0, "area_pct": 0},
        "mapa_calor_png_b64": base64.b64encode(png()).decode(),
    }
    salida = traducir(datos)
    assert salida.revision_sha == REVISION and salida.latencia_ms is None
    gastritis, atrofia = salida.caracteristicas
    assert gastritis.regiones[0].x == Decimal("0.1000")
    assert gastritis.regiones[0].ancho == Decimal("0.4167")
    assert gastritis.regiones[0].area_pct == Decimal("20.50")
    assert gastritis.regiones[0].mapa_png.startswith(b"\x89PNG")
    assert atrofia.probabilidad == Decimal("0.2000") and atrofia.regiones == []


@pytest.mark.parametrize(
    "datos",
    [
        {"predicciones": []},
        {"predicciones": {"X": None}},
        {"predicciones": {"X": {"region_roi": []}}},
        {"predicciones": {"X": {"region_roi": {"x": "no-numero"}}}},
        {
            "predicciones": {
                "X": {
                    "region_roi": {"x": 239, "y": 0, "ancho": 2, "alto": 2, "area_pct": 1},
                    "probabilidad": 0.8,
                }
            }
        },
    ],
)
def test_rechaza_respuesta_fold2_incompleta_o_malformada(datos):
    with pytest.raises(ErrorInferencia, match="RESPUESTA_INVALIDA"):
        traducir({"revision_sha": REVISION, **datos})


def test_rechaza_roi_fuera_de_la_imagen_y_mapa_mayor_al_limite():
    interna = {
        "revision_sha": REVISION,
        "caracteristicas": [
            {
                "codigo": "X",
                "probabilidad": 0.8,
                "regiones": [
                    {
                        "x": 0.8,
                        "y": 0,
                        "ancho": 0.3,
                        "alto": 0.2,
                        "area_pct": 1,
                        "mapa_calor_base64": base64.b64encode(png()).decode(),
                    }
                ],
            }
        ],
    }
    with pytest.raises(ErrorInferencia, match="RESPUESTA_INVALIDA"):
        traducir(interna)

    datos = espacio()
    datos["predicciones"]["GASTRITIS"]["mapa_calor_png_b64"] = base64.b64encode(png(2049)).decode()
    with pytest.raises(ErrorInferencia, match="RESPUESTA_INVALIDA"):
        traducir(datos)


def _adaptador(handler, sha=HUELLA):
    return AdaptadorHuggingFace(
        "https://modelo.invalid",
        "token-sintetico",
        api_key="clave-sintetica",
        sha256_esperado=sha,
        transporte=httpx.MockTransport(handler),
    )


@pytest.mark.parametrize("valor", [None, 3, "c" * 64])
def test_rechaza_huella_ausente_o_distinta(valor):
    datos = espacio()
    if valor is None:
        del datos["checkpoint_sha256"]
    else:
        datos["checkpoint_sha256"] = valor
    adaptador = _adaptador(lambda request: httpx.Response(200, json=datos))
    with pytest.raises(ErrorInferencia, match="HUELLA_DISTINTA"):
        adaptador.clasificar(b"imagen", FormatoImagen.PNG)


def test_acepta_huella_case_insensitive_si_coincide():
    datos = espacio()
    datos["checkpoint_sha256"] = HUELLA.upper()
    salida = _adaptador(lambda request: httpx.Response(200, json=datos)).clasificar(
        b"imagen", FormatoImagen.PNG
    )
    assert salida.caracteristicas[0].codigo == "GASTRITIS"


def test_salud_devuelve_revision_normalizada_y_ninguna_si_no_hay_json():
    adapter = _adaptador(
        lambda request: httpx.Response(200, json={"revision_sha": REVISION.upper()})
    )
    assert adapter.salud() == REVISION
    adapter = _adaptador(lambda request: httpx.Response(200, content=b"no-json"))
    assert adapter.salud() is None
    adapter = _adaptador(lambda request: httpx.Response(200, json={"status": "ready"}))
    assert adapter.salud() is None


@pytest.mark.parametrize(
    "handler,codigo",
    [
        (
            lambda request: (_ for _ in ()).throw(httpx.ReadTimeout("fake", request=request)),
            "TIEMPO_AGOTADO",
        ),
        (
            lambda request: (_ for _ in ()).throw(httpx.ConnectError("fake", request=request)),
            "NO_DISPONIBLE",
        ),
        (lambda request: httpx.Response(503), "NO_DISPONIBLE"),
    ],
)
def test_salud_mapea_timeout_conexion_y_http_no_exitoso(handler, codigo):
    with pytest.raises(ErrorInferencia) as error:
        _adaptador(handler).salud()
    assert error.value.codigo == codigo


def test_salud_sin_https_o_token_no_llama_al_space():
    for url, token in [("http://modelo.invalid", "token"), ("https://modelo.invalid", "")]:
        adapter = AdaptadorHuggingFace(url, token, api_key="clave-sintetica")
        with pytest.raises(ErrorInferencia, match="SIN_CONFIGURAR"):
            adapter.salud()


def test_inferencia_simulada_es_reproducible_y_se_restringe_a_desarrollo():
    codes = tuple(f"CLASE_{index}" for index in range(200))
    simulado = InferenciaSimulada(REVISION.upper(), codes)
    primera = simulado.clasificar(b"imagen sintetica", FormatoImagen.PNG)
    segunda = simulado.clasificar(b"imagen sintetica", FormatoImagen.JPEG)
    assert primera == segunda
    assert primera.revision_sha == REVISION
    assert any(c.regiones for c in primera.caracteristicas)
    assert any(not c.regiones for c in primera.caracteristicas)
    assert simulado.salud() == REVISION

    ajustes = NS(hf_simulado=True, environment="production", hf_revision=REVISION)
    with pytest.raises(RuntimeError, match="solo se permite"):
        crear_inferencia(ajustes, ())
    ajustes.environment = "development"
    assert isinstance(crear_inferencia(ajustes, ()), InferenciaSimulada)


def test_crear_inferencia_real_traslada_configuracion_y_secretos():
    ajustes = NS(
        hf_simulado=False,
        hf_space_url="https://modelo.invalid",
        hf_revision=REVISION,
        hf_token=SecretStr("token-sintetico"),
        gastroai_api_key=SecretStr("clave-sintetica"),
        hf_sha256=HUELLA,
        http_timeout_seconds=12,
    )
    adapter = crear_inferencia(ajustes, ())
    assert isinstance(adapter, AdaptadorHuggingFace)
    assert adapter._token == "token-sintetico" and adapter._api_key == "clave-sintetica"
    assert adapter._timeout == 12 and adapter._sha256_esperado == HUELLA
