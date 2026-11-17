"""RNF-20/#208: procesamiento determinista, imágenes sintéticas y dependencias locales."""
import io
import socket
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import numpy as np
import pytest
from PIL import Image, PngImagePlugin

from app.models import CausaCalidad, EstadoAnalisis, EtapaProceso
from app.services import calidad_imagen as calidad
from app.services.analisis import CodigoFalla
from app.services.procesamiento import ServicioProcesamiento, tiene_metadatos


@pytest.fixture(autouse=True)
def sin_red(monkeypatch):
    def prohibida(*args, **kwargs):
        raise AssertionError("Prueba unitaria: acceso a red prohibido")
    monkeypatch.setattr(socket.socket, "connect", prohibida)
    monkeypatch.setattr(socket.socket, "connect_ex", prohibida)
    monkeypatch.setattr(socket, "create_connection", prohibida)


def png(pixeles=None, metadata=None):
    if pixeles is None:
        # Tablero con contraste, brillo medio y ningún píxel saturado.
        pixeles = ((np.indices((224, 224)).sum(axis=0) % 2) * 100 + 60).astype("uint8")
    opciones = {}
    if metadata == "texto":
        texto = PngImagePlugin.PngInfo()
        texto.add_text("Comentario", "DATO_SINTETICO_QA")
        opciones["pnginfo"] = texto
    elif metadata == "exif":
        exif = Image.Exif()
        exif[270] = "DATO_SINTETICO_QA"
        opciones["exif"] = exif
    elif metadata == "icc":
        opciones["icc_profile"] = b"PERFIL_SINTETICO_QA"
    salida = io.BytesIO()
    Image.fromarray(pixeles).save(salida, "PNG", **opciones)
    return salida.getvalue()


@pytest.fixture
def escenario():
    analisis = SimpleNamespace(id=UUID(int=1), estado=EstadoAnalisis.PROCESANDO,
                               etapa_proceso=None, imagen_clave_objeto="analisis/sintetica.png",
                               codigo_error=None)
    repo = Mock()
    repo.por_id.return_value = analisis
    almacen = Mock()
    almacen.leer.return_value = png()
    eventos = []
    unidad = Mock()
    unidad.confirmar.side_effect = lambda: eventos.append(
        (analisis.etapa_proceso, analisis.estado, analisis.codigo_error))
    clasificador = Mock()
    servicio = ServicioProcesamiento(repo, almacen, unidad, clasificador)
    return SimpleNamespace(a=analisis, repo=repo, almacen=almacen, unidad=unidad,
                           clasificador=clasificador, eventos=eventos, servicio=servicio)


def test_transiciones_y_medidas_persistidas(escenario):
    e = escenario
    e.servicio.procesar(e.a.id)
    assert [v[0] for v in e.eventos] == [EtapaProceso.ANONIMIZAR, EtapaProceso.CALIDAD,
                                        EtapaProceso.CALIDAD, EtapaProceso.CLASIFICAR]
    assert all(v[1] == EstadoAnalisis.PROCESANDO for v in e.eventos)
    assert e.a.calidad_suficiente is True
    assert e.a.calidad_nitidez > Decimal("85")
    assert e.a.calidad_brillo == Decimal("110.0")
    assert e.a.calidad_saturados_pct == Decimal("0.0")
    assert e.a.causas_calidad == []
    e.clasificador.assert_called_once_with(e.a, e.almacen.leer.return_value)
    e.almacen.subir.assert_not_called()
    e.unidad.descartar.assert_not_called()


@pytest.mark.parametrize("metadata", ["texto", "exif", "icc"])
def test_elimina_metadatos_antes_de_clasificar(escenario, metadata):
    e = escenario
    original = png(metadata=metadata)
    assert tiene_metadatos(original)
    e.almacen.leer.return_value = original
    e.servicio.procesar(e.a.id)
    e.almacen.subir.assert_called_once()
    clave, limpia, mime = e.almacen.subir.call_args.args
    assert (clave, mime) == (e.a.imagen_clave_objeto, "image/png")
    assert not tiene_metadatos(limpia)
    assert b"DATO_SINTETICO_QA" not in limpia
    with Image.open(io.BytesIO(original)) as antes, Image.open(io.BytesIO(limpia)) as despues:
        assert np.array_equal(np.asarray(antes), np.asarray(despues))
    e.clasificador.assert_called_once_with(e.a, limpia)


def test_calidad_insuficiente_detiene_clasificacion(escenario):
    e = escenario
    e.almacen.leer.return_value = png(np.zeros((224, 224), dtype="uint8"))
    e.servicio.procesar(e.a.id)
    assert e.a.estado == EstadoAnalisis.FALLIDO
    assert e.a.etapa_proceso == EtapaProceso.CALIDAD
    assert e.a.codigo_error == CodigoFalla.CALIDAD_INSUFICIENTE.value
    assert e.a.causas_calidad == [CausaCalidad.BORROSA, CausaCalidad.OSCURA]
    assert e.a.calidad_suficiente is False
    assert e.eventos[-1][1:] == (EstadoAnalisis.FALLIDO, CodigoFalla.CALIDAD_INSUFICIENTE.value)
    e.clasificador.assert_not_called()
    e.unidad.descartar.assert_not_called()


@pytest.mark.parametrize("origen,etapa", [("leer", EtapaProceso.ANONIMIZAR),
    ("subir", EtapaProceso.ANONIMIZAR), ("corrupta", EtapaProceso.ANONIMIZAR),
    ("clasificar", EtapaProceso.CLASIFICAR)])
def test_errores_controlados_y_rollback(escenario, origen, etapa):
    e = escenario
    if origen == "leer":
        e.almacen.leer.side_effect = OSError("fallo sintético")
    elif origen == "subir":
        e.almacen.leer.return_value = png(metadata="texto")
        e.almacen.subir.side_effect = OSError("fallo sintético")
    elif origen == "corrupta":
        e.almacen.leer.return_value = b"no es imagen"
    else:
        e.clasificador.side_effect = RuntimeError("fallo sintético")
    e.servicio.procesar(e.a.id)
    assert e.a.estado == EstadoAnalisis.FALLIDO
    assert e.a.etapa_proceso == etapa
    assert e.a.codigo_error == CodigoFalla.ERROR_INTERNO.value
    e.unidad.descartar.assert_called_once_with()
    assert e.eventos[-1] == (etapa, EstadoAnalisis.FALLIDO, CodigoFalla.ERROR_INTERNO.value)
    if origen != "clasificar":
        e.clasificador.assert_not_called()


@pytest.mark.parametrize("estado", [None, EstadoAnalisis.COMPLETADO, EstadoAnalisis.FALLIDO])
def test_inexistente_o_finalizado_no_reprocesa(escenario, estado):
    e = escenario
    if estado is None:
        e.repo.por_id.return_value = None
    else:
        e.a.estado = estado
    e.servicio.procesar(e.a.id)
    e.almacen.leer.assert_not_called()
    e.clasificador.assert_not_called()
    e.unidad.confirmar.assert_not_called()
    e.unidad.descartar.assert_not_called()


def test_mensaje_repetido_despues_de_completar_no_clasifica_dos_veces(escenario):
    e = escenario
    e.clasificador.side_effect = lambda *_: setattr(e.a, "estado", EstadoAnalisis.COMPLETADO)
    e.servicio.procesar(e.a.id)
    eventos = list(e.eventos)
    e.servicio.procesar(e.a.id)
    e.clasificador.assert_called_once()
    e.almacen.leer.assert_called_once()
    assert e.eventos == eventos


def test_reentrega_en_proceso_reinicia_etapas(escenario):
    e = escenario
    e.a.etapa_proceso = EtapaProceso.CLASIFICAR
    e.servicio.procesar(e.a.id)
    assert e.eventos[0][0] == EtapaProceso.ANONIMIZAR
    e.clasificador.assert_called_once()


def test_sin_clasificador_permanece_en_clasificar(escenario):
    e = escenario
    servicio = ServicioProcesamiento(e.repo, e.almacen, e.unidad)
    servicio.procesar(e.a.id)
    assert e.a.estado == EstadoAnalisis.PROCESANDO
    assert e.a.etapa_proceso == EtapaProceso.CLASIFICAR
    assert e.a.codigo_error is None


@pytest.mark.parametrize("valor,causas", [(0, [CausaCalidad.BORROSA, CausaCalidad.OSCURA]),
    (100, [CausaCalidad.BORROSA]), (255, [CausaCalidad.BORROSA, CausaCalidad.MUY_CLARA_O_REFLEJOS])])
def test_calidad_pixeles_reales_y_acumulacion_causas(valor, causas):
    medida = calidad.medir_calidad(png(np.full((224, 224), valor, dtype="uint8")))
    assert medida.nitidez == 0
    assert medida.brillo == valor
    assert medida.saturados_pct == (100 if valor == 255 else 0)
    assert medida.causas == causas
    assert medida.suficiente is False


@pytest.mark.parametrize("nitidez,borrosa", [(84.99, True), (85, False), (85.01, False)])
def test_limite_nitidez(monkeypatch, nitidez, borrosa):
    # Aísla el límite de negocio del cálculo numérico de OpenCV.
    monkeypatch.setattr(calidad.cv2, "Laplacian", lambda *_: SimpleNamespace(var=lambda: nitidez))
    medida = calidad.medir_calidad(png())
    assert (CausaCalidad.BORROSA in medida.causas) is borrosa
    assert medida.suficiente is (not borrosa)


@pytest.mark.parametrize("brillo,causa", [(49, CausaCalidad.OSCURA), (50, None),
    (180, None), (181, CausaCalidad.MUY_CLARA_O_REFLEJOS)])
def test_limites_brillo(monkeypatch, brillo, causa):
    monkeypatch.setattr(calidad.cv2, "Laplacian", lambda *_: SimpleNamespace(var=lambda: 100))
    medida = calidad.medir_calidad(png(np.full((224, 224), brillo, dtype="uint8")))
    assert medida.causas == ([] if causa is None else [causa])
    assert medida.suficiente is (causa is None)


@pytest.mark.parametrize("cantidad,valor,rechaza", [(4, 250, False), (5, 250, True),
    (6, 250, True), (5, 249, False)])
def test_limites_reflejos_y_pixel_saturado(monkeypatch, cantidad, valor, rechaza):
    monkeypatch.setattr(calidad.cv2, "Laplacian", lambda *_: SimpleNamespace(var=lambda: 100))
    pixeles = np.full((10, 10), 100, dtype="uint8")
    pixeles.flat[:cantidad] = valor
    medida = calidad.medir_calidad(png(pixeles))
    assert medida.saturados_pct == (cantidad if valor >= 250 else 0)
    assert (CausaCalidad.MUY_CLARA_O_REFLEJOS in medida.causas) is rechaza
    assert medida.suficiente is (not rechaza)


def test_calidad_rechaza_bytes_corruptos():
    with pytest.raises(calidad.ImagenNoDecodificable):
        calidad.medir_calidad(b"imagen sintetica corrupta")
